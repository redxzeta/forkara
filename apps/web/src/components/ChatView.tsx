import {
  type AutomationDefinition,
  type AutomationSchedule,
  type ApprovalRequestId,
  DEFAULT_MODEL_BY_PROVIDER,
  EventId,
  MessageId,
  type MakeNoMistakeLevel,
  type ModelSelection,
  type NativeApi,
  type OrchestrationShellSnapshot,
  type ProjectScript,
  type ModelSlug,
  type ProviderKind,
  type ProjectEntry,
  type ProjectId,
  type ProviderApprovalDecision,
  type ProviderMentionReference,
  type ProviderNativeCommandDescriptor,
  type ProviderPluginDescriptor,
  type ProviderRequestKind,
  type ProviderSkillDescriptor,
  type ProviderSkillReference,
  type ProviderStartOptions,
  type ProviderUserInputAnswers,
  type PinnedMessage,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  type ResolvedKeybindingsConfig,
  type ServerProviderStatus,
  ThreadId,
  ThreadMarkerId,
  type ThreadGoalAchievement,
  type ThreadMarker,
  type ThreadMarkerColor,
  type ThreadMarkerStyle,
  type TurnId,
  type EditorId,
  type KeybindingCommand,
  OrchestrationThreadActivity,
  ProviderInteractionMode,
  RuntimeMode,
} from "@forkara/contracts";
import { automationRequiresTargetThread } from "@forkara/shared/automationMode";
import { respondingInteractionReclaimAt } from "@forkara/shared/pendingInteractions";
import { providerSupportsNativeTurnSteering } from "@forkara/shared/providerMetadata";
import { getModelCapabilities, normalizeModelSlug } from "@forkara/shared/model";
import {
  resolveLatestTailUserMessageEditTarget,
  resolveTailUserMessageEditTarget,
} from "@forkara/shared/conversationEdit";
import { threadExportBlockedReason } from "@forkara/shared/threadExport";
import { pendingRequestInstanceKey } from "@forkara/shared/threadSummary";
import {
  buildPromptThreadTitleFallback,
  GENERIC_CHAT_THREAD_TITLE,
} from "@forkara/shared/chatThreads";
import {
  resolveThreadWorkspaceState,
  resolveThreadBranchSourceCwd,
  resolveThreadWorkspaceCwd as resolveSharedThreadWorkspaceCwd,
} from "@forkara/shared/threadEnvironment";
import {
  deriveAssociatedWorktreeMetadata,
  workspaceRootsEqual,
} from "@forkara/shared/threadWorkspace";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
  type ReactNode,
} from "react";
import { GoTasklist } from "react-icons/go";
import { flushSync } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Debouncer, useDebouncedValue } from "@tanstack/react-pacer";
import { useNavigate } from "@tanstack/react-router";
import { type LegendListRef } from "@legendapp/list/react";
import { buildTemporaryWorktreeBranchName } from "@forkara/shared/git";
import {
  GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS,
  gitCreateDetachedWorktreeMutationOptions,
  gitGithubRepositoryQueryOptions,
  gitBranchesQueryOptions,
  gitStatusQueryOptions,
} from "~/lib/gitReactQuery";
import { resolveProviderDiscoveryCwd } from "~/lib/providerDiscovery";
import {
  providerComposerCapabilitiesQueryOptions,
  providerCommandsQueryOptions,
  providerPluginsQueryOptions,
  providerSkillsQueryOptions,
  supportsNativeSlashCommandDiscovery,
  supportsPluginDiscovery,
  supportsSkillDiscovery,
  supportsThreadCompaction,
} from "~/lib/providerDiscoveryReactQuery";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import {
  hasReconciledServerProviderStatuses,
  serverConfigQueryOptions,
  serverQueryKeys,
  serverSettingsQueryOptions,
} from "~/lib/serverReactQuery";
import { useRefreshProviderStatusesNow } from "~/hooks/useProviderStatusRefresh";
import { useProviderStatusesForLocalConfig } from "~/hooks/useProviderStatusesForLocalConfig";
import { SINGLE_CHAT_PANE_SCOPE_ID } from "~/lib/chatPaneScope";
import {
  composerMentionPathNeedsQuoting,
  formatComposerMentionToken,
  filterPromptProviderMentionReferences,
  filterPromptSkillReferences,
  providerMentionReferencesEqual,
  providerSkillReferencesEqual,
  skillMentionPrefix,
} from "~/lib/composerMentions";
import { getLocalFolderBrowseRootPath, isLocalFolderMentionQuery } from "~/lib/localFolderMentions";
import {
  findProviderStatus,
  normalizeCustomBinaryPath,
  normalizeProviderStatusForLocalConfig,
  resolveProviderSendAvailabilityWithRefresh,
  resolveAvailableProviderPreference,
} from "~/lib/providerAvailability";
import {
  loadConfirmedCustomBinaryPaths,
  saveConfirmedCustomBinaryPaths,
} from "../confirmedCustomBinaryPathStore";
import { isElectron } from "../env";
import { isScrollContainerNearBottom } from "../chat-scroll";
import { stripDiffSearchParams } from "../diffRouteSearch";
import { resolveSubagentPresentationForThread } from "../lib/subagentPresentation";
import { ensureHomeChatProject, isHomeChatContainerProject } from "../lib/chatProjects";
import { ensureStudioProject, isStudioContainerProject } from "../lib/studioProjects";
import { resolveFirstSendTarget } from "../lib/chatFirstSend";
import { readActiveSpaceId } from "../spacesUiStore";
import {
  createOrRecoverProjectFromPath,
  PROJECT_CREATE_EXISTING_SYNC_ERROR,
  PROJECT_CREATE_SYNC_ERROR,
} from "../lib/projectCreation";
import {
  maybeResolveBrowserPromptAttachment,
  type BrowserPromptAttachmentResolution,
} from "../lib/browserPromptContext";
import {
  maybeResolveDevicePromptAttachment,
  type DevicePromptAttachmentResolution,
} from "../lib/devicePromptContext";
import {
  buildComposerFileAttachmentsFromFiles,
  stageUploadComposerAttachments,
  cloneComposerImageAttachment,
  effectiveComposerAttachmentCount,
  findPendingBlobComposerAttachments,
  formatOutgoingComposerPrompt,
  hydratePendingBlobComposerAttachments,
  readFileAsDataUrl,
} from "../lib/composerSend";
import { composerImageBlobKey, persistComposerImageBlob } from "../lib/composerImageBlobStore";
import { reconcileDeletedThreadFromClient } from "../lib/deletedThreadClientReconciliation";
import {
  armQueuedComposerSteerGate,
  claimQueuedComposerAutoDispatch,
  clearQueuedComposerSteerGate,
  getQueuedComposerSteerGate,
  isQueuedComposerAwaitingTurnStart,
  releaseQueuedComposerAutoDispatch,
  runLockedQueuedComposerAutoDispatch,
  tryBeginQueuedComposerAutoDispatch,
} from "../lib/queuedComposerDrain";
import { extractChatAutomationInvocation } from "../lib/automationIntent";
import {
  automationClarificationPrompt,
  buildComposerAutomationDraft,
  resolveComposerAutomationRequest,
} from "../lib/composerAutomation";
import {
  acknowledgedRiskIdsForDraft,
  hasBlockingAutomationDraftWarnings,
  type AutomationDraftWarning,
  type AutomationDraftWarningId,
} from "../lib/automationDraft";
import { dispatchThreadRename } from "../lib/threadRename";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { splitComposerDropzoneFiles, useComposerDropzone } from "../hooks/useComposerDropzone";
import { useComposerImageIntake } from "../hooks/useComposerImageIntake";
import { useDiffRouteSearch } from "../hooks/useDiffRouteSearch";
import {
  buildThreadBreadcrumbs,
  buildTranscriptAutoFollowSignal,
  buildTranscriptTailKey,
  commitAfterRuntimeModePersistence,
  createRuntimeModePersistenceQueue,
  derivePromptHistoryFromMessages,
  enrichSubagentWorkEntries,
  hasFileUndoSettled,
  persistModelSelectionBeforeRuntimeMode,
  promptStillMatchesActiveHistoryBrowse,
  type PendingFileUndo,
  type PromptHistoryNavigationState,
  resolveActiveThreadTitle,
  resolveActiveTurnLiveDiffState,
  resolveCommittedProviderModel,
  resolveComposerStripWorkLogEntries,
  resolveCycledModelSlug,
  resolveDefaultEnvironmentPanelOpen,
  resolveEnvironmentPanelOpen,
  resolveEnvironmentPanelPreferenceAfterFirstSend,
  resolveEnvironmentPanelPreferenceUpdate,
  resolveEnvironmentPanelVisible,
  resolveGitRepoUiState,
  resolveProjectScriptTerminalTarget,
  resolvePromptHistoryNavigation,
  resolveSettledThreadBranchMismatch,
  resolveThreadDetailHydration,
  shouldHandlePromptHistoryNavigationKey,
  shouldEnableComposerPastedTextCollapse,
  shouldConsumePendingCustomBinaryConfirmation,
  shouldShowComposerModelBootstrapSkeleton,
} from "./ChatView.logic";
import {
  createRelevantWorkLogThreadsSelector,
  createThreadLineageSelector,
  localSubagentThreadId,
} from "./ChatView.selectors";
import {
  clampCollapsedComposerCursor,
  type ComposerTrigger,
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  replaceTextRange,
  stripComposerTriggerText,
} from "../composer-logic";
import {
  ensureLeadingSpaceForReplacement,
  extendReplacementRangeForTrailingSpace,
} from "../composerTriggerInsertion";
import {
  createProjectSelector,
  createComposerThreadMentionSourcesSelector,
  createThreadSelector,
} from "../storeSelectors";
import { buildThreadSubscribeInput } from "../threadDetailResumeCursors";
import { retainThreadDetailSubscription } from "../threadDetailSubscriptionRetention";
import {
  canOfferForkSlashCommand,
  canOfferSideSlashCommand,
  canOfferReviewSlashCommand,
  hasProviderNativeSlashCommand,
  providerSupportsTextNativeReviewCommand,
  resolveComposerSlashRootBranch,
} from "../composerSlashCommands";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveActiveTaskListState,
  deriveActiveBackgroundTasksState,
  findSidebarProposedPlan,
  findLatestProposedPlan,
  deriveWorkLogEntries,
  omitRoutedSubagentWorkEntries,
  buildSourceProposedPlanReference,
  hasActionableProposedPlan,
  hasLiveTurnTailWork,
  isLatestTurnSettled,
  type ActiveTaskListState,
} from "../session-logic";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  hasCompletePendingUserInputAnswers,
  omitNullPendingUserInputAnswers,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import { selectRightDockState, useRightDockStore } from "../rightDockStore";
import { useStore } from "../store";
import { RenameThreadDialog } from "./RenameThreadDialog";
import { getThreadFromState } from "../threadDerivation";
import { useWorkspacePathsStore } from "../workspacePathsStore";
import {
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
} from "../proposedPlan";
import { truncateTitle } from "../truncateTitle";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_THREAD_TERMINAL_ID,
  type ChatMessage,
  type Thread,
  type WorktreeSetupResolutionAction,
} from "../types";
import { useTheme } from "../hooks/useTheme";
import { useThreadWorkspaceHandoff } from "../hooks/useThreadWorkspaceHandoff";
import {
  buildSearchableModelOptions,
  useComposerCommandMenuItems,
} from "../hooks/useComposerCommandMenuItems";
import { useProviderModelCatalog } from "../hooks/useProviderModelCatalog";
import { useThreadHandoff } from "../hooks/useThreadHandoff";
import { useThreadUnblock } from "../hooks/useThreadUnblock";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import BranchToolbar, { RuntimeUsageControls } from "./BranchToolbar";
import {
  normalizeRuntimeModeForProvider,
  providerModelSupportsAutoRuntimeMode,
} from "../lib/runtimeMode";
import { ForkaraLogo } from "./ForkaraLogo";
import { ThreadWorktreeHandoffDialog } from "./ThreadWorktreeHandoffDialog";
import {
  formatShortcutLabel,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import PlanSidebar from "./PlanSidebar";
import TerminalWorkspaceTabs from "./TerminalWorkspaceTabs";
import {
  BugIcon,
  ChevronDownIcon,
  ComposerSendArrowIcon,
  LayoutSidebarIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TemporaryThreadIcon,
} from "~/lib/icons";
import { ComposerQueuedHeader } from "./chat/ComposerQueuedHeader";
import { ComposerLiveChangesHeader } from "./chat/ComposerLiveChangesHeader";
import { ComposerGoalHeader } from "./chat/ComposerGoalHeader";
import { ComposerPickerMenuPopup } from "./chat/ComposerPickerMenuPopup";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Menu, MenuItem, MenuTrigger } from "./ui/menu";
import { randomTerminalId } from "./terminal/terminalIds";
import { cn, isMacNavigatorPlatform, randomUUID } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { type NewProjectScriptInput } from "./ProjectScriptsControl";
import {
  commandForProjectScript,
  nextProjectScriptId,
  projectScriptRuntimeEnv,
  projectScriptIdFromCommand,
  setupProjectScript,
  type ProjectScriptRunOptions,
  type ProjectScriptRunResult,
} from "~/projectScripts";
import { runProjectCommandInTerminal } from "~/projectTerminalRunner";
import { newCommandId, newMessageId, newProjectId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { confirmCoreAction } from "~/lib/confirmCoreAction";
import { promoteThreadCreate } from "~/lib/threadCreatePromotion";
import { readFavoriteModelSlugs } from "~/lib/modelFavorites";
import {
  getCustomBinaryPathForProvider,
  getProviderStartOptions,
  resolveAppModelSelection,
  resolveAssistantDeliveryMode,
  resolveFollowUpDispatchMode,
  useAppSettings,
} from "../appSettings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isEditableEventTarget } from "../lib/editableEventTarget";
import { makeNoMistakeResponseModifiers } from "../lib/makeNoMistake";
import {
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type ComposerAssistantSelectionAttachment,
  type BrowserAnnotationDraft,
  type DraftThreadEnvMode,
  type PersistedComposerImageAttachment,
  type QueuedComposerChatTurn,
  type QueuedComposerPlanFollowUp,
  type QueuedComposerTurn,
  type RestoredComposerSourceProposedPlan,
  captureComposerPromptHistorySavedDraft,
  useComposerDraftStore,
  useComposerThreadDraft,
  useEffectiveComposerModelState,
} from "../composerDraftStore";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { useComposerFocusRequestStore } from "../composerFocusRequestStore";
import { useWorkflowRunUiStore, useWorkflowRunUiThreadState } from "../workflowRunUiStore";
import { appendComposerPromptText } from "../lib/chatReferences";
import {
  appendOriginalComposerPromptBlocks,
  appendTerminalContextsToPrompt,
  IMAGE_ONLY_BOOTSTRAP_PROMPT,
  formatTerminalContextLabel,
  insertInlineTerminalContextPlaceholder,
  removeInlineTerminalContextPlaceholder,
  syncTerminalContextsByIds,
  terminalContextIdListsEqual,
  type TerminalContextDraft,
  type TerminalContextSelection,
} from "../lib/terminalContext";
import { registerTerminalContextComposerTarget } from "../lib/terminalContextComposerRegistry";
import {
  appendPastedTextsToPrompt,
  createPastedTextDraft,
  pastedTextTitle,
  type PastedTextDraft,
} from "../lib/composerPastedText";
import {
  appendAssistantSelectionsToPrompt,
  formatAssistantSelectionQueuePreview,
  formatAssistantSelectionTitleSeed,
} from "../lib/assistantSelections";
import {
  appendBrowserAnnotationsToPrompt,
  formatBrowserAnnotationLabel,
} from "../lib/browserAnnotations";
import {
  appendFileCommentsToPrompt,
  formatFileCommentLabel,
  formatFileCommentTitleSeed,
  type FileCommentDraft,
} from "../lib/fileComments";
import {
  deriveContextWindowSelectionStatus,
  deriveCumulativeCostUsd,
  deriveLatestContextWindowState,
  deriveSelectedContextWindowSnapshot,
} from "../lib/contextWindow";
import { useComposerVoiceController } from "./chat/useComposerVoiceController";
import {
  composerFooterPlanForTier,
  resolveNextComposerFooterTier,
  shouldUseCompactComposerFooter,
} from "./composerFooterLayout";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import {
  resolveSplitViewFocusedThreadId,
  selectSplitView,
  type SplitViewPanePanelState,
  useSplitViewStore,
} from "../splitViewStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "./ComposerPromptEditor";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { ChatHeader } from "./chat/ChatHeader";
import { dispatchThreadNotes } from "~/pinnedMessages";
import { dispatchThreadGoal } from "~/threadGoal";
import {
  mergeProjectInstructionsIntoThreadNotes,
  useProjectInstructionsStore,
} from "~/projectInstructionsStore";
import {
  ENVIRONMENT_DOCKED_CONTENT_INSET_PX,
  EnvironmentPanel,
  type EnvironmentPanelProps,
} from "./chat/environment/EnvironmentPanel";
import { usePinnedMessageActions } from "./chat/environment/usePinnedMessageActions";
import {
  CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
  CHAT_SURFACE_HEADER_HEIGHT_CLASS,
  CHAT_SURFACE_HEADER_PADDING_X_CLASS,
  CHAT_SURFACE_HEADER_ROW_CLASS_NAME,
} from "./chat/chatHeaderControls";
import { SidebarHeaderNavigationControls } from "./SidebarHeaderNavigationControls";
import { SidebarHeaderTrigger } from "./ui/sidebar";
import {
  useDesktopTopBarTrafficLightGutterClassName,
  useDesktopTopBarWindowControlsGutterClassName,
} from "~/hooks/useDesktopTopBarGutter";
import { useNowMs } from "~/hooks/useNowMs";
import { useThreadRecap } from "~/hooks/useThreadRecap";
import { useRepoDiffTotals } from "~/hooks/useRepoDiffTotals";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { useCopyThreadIdToClipboard } from "~/hooks/useCopyToClipboard";
import {
  acknowledgedRiskIdsForFormWarnings,
  AutomationDialog,
  automationQueryKey,
  createInputFromForm,
  formatCadence,
  automationsForThread,
  isFormSubmittable,
  projectModelSelection as automationProjectModelSelection,
  type AutomationFormState,
} from "../routes/-automations.shared";
import { ChatTranscriptPane } from "./chat/ChatTranscriptPane";
import { ChatThreadFindHost } from "./chat/ThreadFindBar";
import {
  createThreadFindHighlightStore,
  eventTargetsInAppBrowser,
  shouldCaptureChatFindShortcut,
  type ThreadFindMatch,
} from "./chat/threadFind.logic";
import { ThreadDetailHydrationState } from "./chat/ThreadDetailHydrationState";
import type { MessagesTimelineController } from "./chat/MessagesTimeline";
import { buildTurnDiffSummaryByAssistantMessageId } from "./chat/MessagesTimeline.logic";
import { deriveAgentActivityTimelineState } from "./chat/agentActivity.logic";
import { ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import {
  AVAILABLE_PROVIDER_OPTIONS,
  ProviderModelPicker,
  resolveProviderModelLabel,
} from "./chat/ProviderModelPicker";
import { ComposerModelEffortPicker } from "./chat/ComposerModelEffortPicker";
import { resolveTraitsTriggerSummary, TraitsPicker } from "./chat/TraitsPicker";
import { ComposerCommandItem, ComposerCommandMenu } from "./chat/ComposerCommandMenu";
import {
  ComposerLocalDirectoryMenu,
  type ComposerLocalDirectoryMenuHandle,
} from "./chat/ComposerLocalDirectoryMenu";
import { ComposerPendingApprovalPanel } from "./chat/ComposerPendingApprovalPanel";
import { ComposerExtrasMenu } from "./chat/ComposerExtrasMenu";
import { ComposerBullyModeIndicator } from "./chat/ComposerBullyModeIndicator";
import { recordBullyModeAchievements } from "../achievements/bullyMode";
import { ComposerMakeNoMistakeControl } from "./chat/ComposerMakeNoMistakeControl";
import { ContextWindowMeter } from "./chat/ContextWindowMeter";
import { ComposerInputBanners } from "./chat/ComposerInputBanners";
import { ComposerBranchMismatchBanner } from "./chat/ComposerBranchMismatchBanner";
import { ComposerPendingUserInputPanel } from "./chat/ComposerPendingUserInputPanel";
import { ComposerVoiceButton } from "./chat/ComposerVoiceButton";
import { ComposerVoiceRecorderBar } from "./chat/ComposerVoiceRecorderBar";
import { ComposerReferenceAttachments } from "./chat/ComposerReferenceAttachments";
import { ComposerSlashStatusDialog } from "./chat/ComposerSlashStatusDialog";
import { ExpandedImageOverlay } from "./chat/ExpandedImageOverlay";
import { TranscriptSelectionActionLayer } from "./chat/TranscriptSelectionActionLayer";
import { useChatTerminalController } from "./chat/useChatTerminalController";
import { useChatAutomationSetup } from "./chat/useChatAutomationSetup";
import { ComposerActiveTaskListCard } from "./chat/ComposerActiveTaskListCard";
import { ComposerSubagentStrip } from "./chat/ComposerSubagentStrip";
import {
  collectForegroundRunningSubagentStripItems,
  collectRunningSubagentStripItems,
  deriveComposerSubagentStripItems,
  type ComposerSubagentStripItem,
} from "./chat/ComposerSubagentStrip.logic";
import { WorkflowRunCard } from "./chat/WorkflowRunCard";
import {
  buildWorkflowResumePrompt,
  deriveWorkflowRunState,
  type WorkflowSubagentThreadRef,
} from "./chat/WorkflowRunCard.logic";
import { ComposerColumnFrame } from "./chat/ComposerColumnFrame";
import { useTranscriptAssistantSelectionAction } from "./chat/useTranscriptAssistantSelectionAction";
import {
  scrollTranscriptToSettledEnd,
  stopTranscriptScrollAtCurrentOffset,
} from "./chat/transcriptScroll";
import { resolveTranscriptMarkerRange } from "./chat/chatSelectionActions";
import {
  dispatchThreadMarkerAdd,
  dispatchThreadMarkerDoneSet,
  dispatchThreadMarkerLabelSet,
  dispatchThreadMarkerRemove,
} from "../threadMarkers";
import { getComposerProviderState } from "./chat/composerProviderRegistry";
import {
  composerTranscriptBottomInsetPx,
  environmentPanelBottomInsetPx,
  useComposerOverlayHeight,
} from "./chat/composerOverlay";
import {
  COMPOSER_COMMAND_MENU_FLOATING_WRAPPER_CLASS_NAME,
  COMPOSER_INPUT_SHELL_CLASS_NAME,
  COMPOSER_INPUT_SURFACE_CLASS_NAME,
  COMPOSER_COLUMN_FRAME_CLASS_NAME,
  COMPOSER_EDITOR_PADDING_CLASS_NAME,
  COMPOSER_FOOTER_ROW_CLASS_NAME,
  CHAT_BACKGROUND_CLASS_NAME,
  CHAT_COLUMN_FRAME_CLASS_NAME,
  CHAT_COLUMN_GUTTER_CLASS_NAME,
  ENVIRONMENT_CONTENT_INSET_MOTION_CLASS,
} from "./chat/composerPickerStyles";
import { getComposerTraitSelection } from "./chat/composerTraits";
import { resolveRuntimeModelDescriptor } from "./chat/runtimeModelCapabilities";
import { ProjectPicker } from "./chat/ProjectPicker";
import { FolderClosed } from "./FolderClosed";
import { ProviderHealthBanner } from "./chat/ProviderHealthBanner";
import { useThreadErrorToast } from "./chat/useThreadErrorToast";
import {
  RateLimitBanner,
  deriveLatestRateLimitStatus,
  type RateLimitStatus,
} from "./chat/RateLimitBanner";
import {
  ACTIVE_TURN_LAYOUT_SETTLE_DELAY_MS,
  appendVoiceTranscriptToPrompt,
  shouldStartActiveTurnLayoutGrace,
  buildExpiredTerminalContextToastCopy,
  buildLocalDraftThread,
  DISMISSED_PROVIDER_HEALTH_BANNERS_KEY,
  DismissedProviderHealthBannersSchema,
  collectUserMessageBlobPreviewUrls,
  deriveComposerSendState,
  failWorktreeSetupSnapshot,
  filterSidechatTranscriptMessages,
  hasLiveTurnTakenOver,
  hasServerAcknowledgedLocalDispatch,
  LOCAL_DISPATCH_ACK_TIMEOUT_MS,
  LOCAL_DISPATCH_TURN_TAKEOVER_TIMEOUT_MS,
  resolveNextLocalDispatchSnapshot,
  resolveWorkingLabel,
  resolveThreadArtifactWorkspaceRoot,
  WORKTREE_SETUP_ERROR_HOLD_MS,
  worktreeSetupHasError,
  WorktreeSetupCancelledError,
  createWorktreeSetupResolution,
  runWorktreeCreationFlow,
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
  type LocalDispatchSnapshot,
  type WorktreeSetupDispatchOptions,
  type WorktreeSetupResolution,
  PullRequestDialogState,
  type QueuedSteerGate,
  resolveQueuedSteerGateTransition,
  resolveQueuedComposerAutoDispatchHold,
  shouldRenderProviderHealthBanner,
  resolveRuntimeModeAfterApprovalDecision,
  revokeBlobPreviewUrl,
  revokeUserMessagePreviewUrls,
} from "./ChatView.logic";
import { clearPendingTurnDispatch, markPendingTurnDispatch } from "../pendingTurnDispatch";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useComposerSlashCommands } from "../hooks/useComposerSlashCommands";
import { useFeatureFlags } from "../featureFlags";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  canCreateThreadHandoff,
  resolveAvailableHandoffTargetProviders,
  resolveThreadHandoffBadgeLabel,
} from "../lib/threadHandoff";
import {
  resolveDiffEnvironmentState,
  resolveThreadEnvironmentMode,
} from "../lib/threadEnvironment";
import { buildModelSelection, buildNextProviderOptions } from "../providerModelOptions";
import {
  isDuplicateProjectCreateError,
  waitForRecoverableProjectForDuplicateCreate,
} from "../lib/projectCreateRecovery";
import { ChatComposerFooter } from "./chat/ChatComposerFooter";
import { useChatAutomationCreation } from "./chat/useChatAutomationCreation";
import { useChatComposerCommands } from "./chat/useChatComposerCommands";
import { useChatComposerDraft } from "./chat/useChatComposerDraft";
import { useChatComposerEditing } from "./chat/useChatComposerEditing";
import { useChatKeyboardShortcuts } from "./chat/useChatKeyboardShortcuts";
import { useChatLocalDispatch } from "./chat/useChatLocalDispatch";
import { useChatPendingInteractions } from "./chat/useChatPendingInteractions";
import { useChatProjectScripts } from "./chat/useChatProjectScripts";
import { useChatProviderModels } from "./chat/useChatProviderModels";
import { useChatProviderStatus } from "./chat/useChatProviderStatus";
import { useChatRuntimeModes } from "./chat/useChatRuntimeModes";
import { useChatTimelineMessages } from "./chat/useChatTimelineMessages";
import { useChatTranscriptScroll } from "./chat/useChatTranscriptScroll";
import { useChatTurnFollowUps } from "./chat/useChatTurnFollowUps";
import { useChatWorkLog } from "./chat/useChatWorkLog";
import { useChatWorkspaceSelection } from "./chat/useChatWorkspaceSelection";
import { useComposerDiscovery } from "./chat/useComposerDiscovery";
import { useComposerReferences } from "./chat/useComposerReferences";

// The terminal drawer drags in xterm plus its addons (~223 KB gzip). Both mount points
// are conditional, so loading it lazily keeps the terminal stack out of the initial
// chat bundle and defers the cost to the first time a terminal is actually opened.
const ThreadTerminalDrawer = lazy(() => import("./ThreadTerminalDrawer"));

const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PINNED_MESSAGES: readonly PinnedMessage[] = [];
const EMPTY_THREAD_MARKERS: readonly ThreadMarker[] = [];
const EMPTY_GOAL_ACHIEVEMENTS: readonly ThreadGoalAchievement[] = [];
const EMPTY_PINNED_TEXT: ReadonlyMap<MessageId, string> = new Map();
const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

function revokeBlobPreviewUrlsAfterPaint(previewUrls: readonly string[]): void {
  if (previewUrls.length === 0 || typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      for (const previewUrl of previewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }, 0);
  });
}

// Shared by the live-composer and prompt-history attachment sync effects:
// AppSnap images persist their bytes as IndexedDB blobs (reusing an existing
// blob key when valid), everything else inlines a data URL. Falls back to the
// already-persisted attachments for images whose serialization fails.
async function stagePersistedComposerImageAttachments(input: {
  threadId: ThreadId;
  images: ReadonlyArray<ComposerImageAttachment>;
  getPersistedAttachments: () => PersistedComposerImageAttachment[];
}): Promise<PersistedComposerImageAttachment[]> {
  try {
    const existingPersistedById = new Map(
      input.getPersistedAttachments().map((attachment) => [attachment.id, attachment]),
    );
    const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
    await Promise.all(
      input.images.map(async (image) => {
        try {
          if (image.source?.kind === "appsnap") {
            const existingPersisted = existingPersistedById.get(image.id);
            const expectedBlobKey = composerImageBlobKey(input.threadId, image.id);
            const blobKey =
              existingPersisted?.blobKey === expectedBlobKey
                ? expectedBlobKey
                : await persistComposerImageBlob({
                    threadId: input.threadId,
                    imageId: image.id,
                    file: image.file,
                  });
            stagedAttachmentById.set(image.id, {
              id: image.id,
              name: image.name,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              blobKey,
              source: image.source,
            });
            return;
          }
          const dataUrl = await readFileAsDataUrl(image.file);
          stagedAttachmentById.set(image.id, {
            id: image.id,
            name: image.name,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            dataUrl,
          });
        } catch {
          const existingPersisted = existingPersistedById.get(image.id);
          if (existingPersisted) {
            stagedAttachmentById.set(image.id, existingPersisted);
          }
        }
      }),
    );
    return Array.from(stagedAttachmentById.values());
  } catch {
    const currentImageIds = new Set(input.images.map((image) => image.id));
    return input
      .getPersistedAttachments()
      .filter((attachment) => currentImageIds.has(attachment.id));
  }
}

function eventTargetsComposer(
  event: globalThis.KeyboardEvent,
  composerForm: HTMLFormElement | null,
): boolean {
  if (!composerForm) return false;
  const target = event.target;
  return target instanceof Node ? composerForm.contains(target) : false;
}

function canHandleComposerPickerShortcut(
  event: globalThis.KeyboardEvent,
  composerForm: HTMLFormElement | null,
): boolean {
  if (!composerForm) return false;
  if (eventTargetsComposer(event, composerForm)) return true;
  const target = event.target;
  return (
    target === document.body ||
    target === document.documentElement ||
    document.activeElement === document.body ||
    document.activeElement === document.documentElement
  );
}
const EMPTY_AVAILABLE_EDITORS: EditorId[] = [];
const EMPTY_PROVIDER_STATUSES: ServerProviderStatus[] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};
const EMPTY_TERMINAL_RUNTIME_ENV: Record<string, string> = {};
const MAX_DISMISSED_PROVIDER_HEALTH_BANNERS = 50;
const EMPTY_LAST_INVOKED_SCRIPT_BY_PROJECT: Record<string, string> = {};
const EMPTY_DISMISSED_PROVIDER_HEALTH_BANNERS: ReadonlyArray<string> = [];

function getThreadProviderCustomBinaryPathKey(threadId: Thread["id"], provider: ProviderKind) {
  return `${threadId}:${provider}`;
}

function getConfirmedCustomBinarySessionKey(
  thread: Thread | null | undefined,
  provider: ProviderKind,
): string | null {
  const session = thread?.session;
  if (!thread || session?.provider !== provider) {
    return null;
  }
  if (session.status !== "ready" && session.status !== "running") {
    return null;
  }
  return getThreadProviderCustomBinaryPathKey(thread.id, provider);
}

function getProviderStartOptionsCustomBinaryPath(
  providerOptions: ProviderStartOptions | undefined,
  provider: ProviderKind,
): string | null {
  switch (provider) {
    case "codex":
      return normalizeCustomBinaryPath(providerOptions?.codex?.binaryPath);
    case "claudeAgent":
      return normalizeCustomBinaryPath(providerOptions?.claudeAgent?.binaryPath);
    case "antigravity":
      return normalizeCustomBinaryPath(providerOptions?.antigravity?.binaryPath);
    case "grok":
      return normalizeCustomBinaryPath(providerOptions?.grok?.binaryPath);
    case "droid":
      return normalizeCustomBinaryPath(providerOptions?.droid?.binaryPath);
    case "kilo":
      return normalizeCustomBinaryPath(providerOptions?.kilo?.binaryPath);
    case "opencode":
      return normalizeCustomBinaryPath(providerOptions?.opencode?.binaryPath);
    case "cursor":
      return normalizeCustomBinaryPath(providerOptions?.cursor?.binaryPath);
    case "pi":
      return normalizeCustomBinaryPath(providerOptions?.pi?.binaryPath);
  }
}

function getProviderHealthBannerDismissalKey(status: ServerProviderStatus | null): string | null {
  if (!status || status.status === "ready") {
    return null;
  }
  return [
    status.provider,
    status.status,
    status.available ? "available" : "unavailable",
    status.authStatus,
    status.message?.trim() ?? "",
  ].join("\u001f");
}

function getRateLimitBannerDismissalKey(
  status: RateLimitStatus | null,
  threadId: Thread["id"] | null,
): string | null {
  if (!status || !threadId) {
    return null;
  }
  return [
    threadId,
    status.status,
    status.resetsAt ?? "",
    typeof status.utilization === "number" ? String(Math.round(status.utilization * 100)) : "",
  ].join("\u001f");
}

type ComposerPluginSuggestion = {
  plugin: ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

const EMPTY_COMPOSER_PLUGIN_SUGGESTIONS: ComposerPluginSuggestion[] = [];

function buildQueuedComposerPreviewText(input: {
  trimmedPrompt: string;
  images: ReadonlyArray<ComposerImageAttachment>;
  files: ReadonlyArray<ComposerFileAttachment>;
  assistantSelections: ReadonlyArray<{ id: string }>;
  browserAnnotations: ReadonlyArray<BrowserAnnotationDraft>;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
  fileComments: ReadonlyArray<FileCommentDraft>;
  pastedTexts: ReadonlyArray<PastedTextDraft>;
}): string {
  if (input.trimmedPrompt.length > 0) {
    return input.trimmedPrompt;
  }
  const firstImage = input.images[0];
  if (firstImage) {
    return `Image: ${firstImage.name}`;
  }
  const firstFile = input.files[0];
  if (firstFile) {
    return `File: ${firstFile.name}`;
  }
  if (input.assistantSelections.length > 0) {
    return formatAssistantSelectionQueuePreview(input.assistantSelections.length);
  }
  const firstBrowserAnnotation = input.browserAnnotations[0];
  if (firstBrowserAnnotation) {
    return `#${firstBrowserAnnotation.ordinal} ${formatBrowserAnnotationLabel(firstBrowserAnnotation)}`;
  }
  const firstTerminalContext = input.terminalContexts[0];
  if (firstTerminalContext) {
    return formatTerminalContextLabel(firstTerminalContext);
  }
  const firstFileComment = input.fileComments[0];
  if (firstFileComment) {
    return formatFileCommentLabel(firstFileComment);
  }
  const pastedTitle = formatPastedTextTitleSeed(input.pastedTexts);
  if (pastedTitle) {
    return pastedTitle;
  }
  return "Queued follow-up";
}

function formatPastedTextTitleSeed(pastedTexts: ReadonlyArray<PastedTextDraft>): string | null {
  const firstPastedText = pastedTexts[0];
  if (!firstPastedText) {
    return null;
  }
  return pastedTexts.length === 1
    ? pastedTextTitle(firstPastedText.text)
    : `${pastedTexts.length} pasted texts`;
}

const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;
const VOICE_RECORDER_ACTION_ARM_DELAY_MS = 250;

function warnVoiceGuard(event: string, details?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }
  if (details) {
    console.warn(`[voice] ${event}`, details);
    return;
  }
  console.warn(`[voice] ${event}`);
}

function ComposerControlSkeleton(props: { widthClassName: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md border border-border/50 px-2",
        props.widthClassName,
      )}
    >
      <Skeleton className="h-3.5 w-full rounded-full" />
    </div>
  );
}

function ComposerModelLoadingControl(props: { widthClassName: string }) {
  return (
    <div
      aria-label="Loading models"
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/50 px-2 text-muted-foreground",
        props.widthClassName,
      )}
    >
      <RefreshCwIcon aria-hidden="true" className="size-3.5 animate-spin" />
      <span className="truncate text-[length:var(--app-font-size-ui-xs,11px)]">Loading models</span>
    </div>
  );
}

interface PlanFollowUpSubmission {
  text: string;
  interactionMode: "default" | "plan";
  dispatchMode: "queue" | "steer";
  makeNoMistakeLevel?: MakeNoMistakeLevel;
  queuedTurn?: QueuedComposerPlanFollowUp;
}

/**
 * Send-path handlers that are declared *after* `onSend` in the component body (they depend on
 * state and callbacks that are set up later) yet have to be reachable from it — and, for
 * `send` itself, from the queued-turn dispatcher that is declared before it.
 *
 * Reading a later-declared binding from an earlier one makes React Compiler bail out on the
 * whole component ("Cannot access variable before it is declared") — silently, since
 * `panicThreshold` is unset — which would drop memoization for the single hottest component in
 * the app. Routing those calls through one latest-value ref keeps every reference well-ordered.
 * The ref is only ever read from user-driven send flows, never during render, and it is
 * refreshed in a layout effect so no passive-effect window can serve a stale handler.
 */
interface LateComposerSendHandlers {
  readonly send: (
    event?: { preventDefault: () => void },
    dispatchMode?: "queue" | "steer",
    queuedTurn?: QueuedComposerChatTurn,
  ) => Promise<boolean>;
  readonly submitPlanFollowUp: (submission: PlanFollowUpSubmission) => Promise<boolean>;
  readonly advanceActivePendingUserInput: (
    answerOverrides?: Record<string, PendingUserInputDraftAnswer>,
  ) => boolean;
  readonly handleStandaloneSlashCommand: (trimmedPrompt: string) => Promise<boolean>;
}

interface ChatViewProps {
  threadId: ThreadId;
  paneScopeId?: string;
  surfaceMode?: "single" | "split";
  presentationMode?: "default" | "editor";
  isFocusedPane?: boolean;
  panelState?: SplitViewPanePanelState;
  onToggleDiffPanel?: () => void;
  onToggleRightDock?: () => void;
  onToggleBrowserPanel?: () => void;
  onToggleDevicePanel?: () => void;
  onOpenBrowserUrl?: (url: string) => void;
  onOpenTurnDiffPanel?: (turnId: TurnId, filePath?: string) => void;
  onSplitSurface?: () => void;
  onMaximizeSurface?: () => void;
  viewModeAction?: {
    label: string;
    active: boolean;
    onClick: () => void;
  } | null;
  onChangeThreadInSplitPane?: () => void;
  onCloseThreadPane?: () => void;
}

// Builds an ephemeral transcript bubble for the conversational automation-setup
// exchange. These never reach a provider and are not persisted; they render the
// back-and-forth (user request, Forkara's clarifying questions) inline like Codex.
function makeAutomationSetupBubble(role: "user" | "assistant", text: string): ChatMessage {
  return {
    id: newMessageId(),
    role,
    text,
    createdAt: new Date().toISOString(),
    streaming: false,
    source: "native",
  };
}

export default function ChatView({
  threadId,
  paneScopeId: paneScopeIdProp,
  surfaceMode: surfaceModeProp,
  presentationMode: presentationModeProp,
  isFocusedPane: isFocusedPaneProp,
  panelState,
  onToggleDiffPanel,
  onToggleRightDock,
  onToggleBrowserPanel,
  onToggleDevicePanel,
  onOpenBrowserUrl,
  onOpenTurnDiffPanel,
  onSplitSurface,
  onMaximizeSurface,
  viewModeAction: viewModeActionProp,
  onChangeThreadInSplitPane,
  onCloseThreadPane,
}: ChatViewProps) {
  // Prop defaults are resolved here instead of in the destructuring pattern: an
  // AssignmentPattern in the parameter list makes React Compiler bail out (silently —
  // `panicThreshold` is unset) on this entire component, the hottest one in the app.
  // See chatHotPath.compiler.test.ts.
  const paneScopeId = paneScopeIdProp ?? SINGLE_CHAT_PANE_SCOPE_ID;
  const surfaceMode = surfaceModeProp ?? "single";
  const presentationMode = presentationModeProp ?? "default";
  const isFocusedPane = isFocusedPaneProp ?? true;
  const viewModeAction = viewModeActionProp ?? null;
  const markThreadVisited = useStore((store) => store.markThreadVisited);
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const setStoreThreadError = useStore((store) => store.setError);
  const setStoreThreadWorkspace = useStore((store) => store.setThreadWorkspace);
  const { settings, updateSettings } = useAppSettings();
  const handleBullyModeChange = (enabled: boolean) => updateSettings({ bullyModeEnabled: enabled });
  const assistantDeliveryMode = resolveAssistantDeliveryMode(settings);
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const desktopTopBarWindowControlsGutterClassName =
    useDesktopTopBarWindowControlsGutterClassName();
  const setComposerDraftModelSelectionAndSticky = useComposerDraftStore(
    (store) => store.setModelSelectionAndSticky,
  );
  const timestampFormat = settings.timestampFormat;
  // The composer floats over the transcript; its measured height becomes the
  // transcript's bottom content inset (see composerOverlay.ts).
  const {
    overlayRef: composerOverlayRef,
    overlayHeightPx: composerOverlayHeightPx,
    overlayBottomClearancePx: composerOverlayBottomClearancePx,
    overlayAnchorGapPx: composerOverlayAnchorGapPx,
  } = useComposerOverlayHeight();
  const composerTranscriptInsetPx = composerTranscriptBottomInsetPx(composerOverlayHeightPx);
  const navigate = useNavigate();
  const { handleNewThread } = useHandleNewThread();
  const { handleNewChat } = useHandleNewChat();
  const { createThreadHandoff } = useThreadHandoff();
  const rawSearch = useDiffRouteSearch();
  const activeSplitView = useSplitViewStore(
    useMemo(() => selectSplitView(rawSearch.splitViewId ?? null), [rawSearch.splitViewId]),
  );
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();
  const createWorktreeMutation = useMutation(
    gitCreateDetachedWorktreeMutationOptions({ queryClient }),
  );
  const isEditorRail = presentationMode === "editor";
  const isInactiveSplitPane = surfaceMode === "split" && !isFocusedPane;
  const composerDraft = useComposerThreadDraft(threadId);
  const prompt = composerDraft.prompt;
  const composerPromptHistorySavedDraft = composerDraft.promptHistorySavedDraft;
  const composerPromptHistorySavedDraftImages = composerPromptHistorySavedDraft?.images ?? null;
  const composerImages = composerDraft.images;
  const composerFiles = composerDraft.files;
  const composerAssistantSelections = composerDraft.assistantSelections;
  const composerBrowserAnnotations = composerDraft.browserAnnotations;
  const composerFileComments = composerDraft.fileComments;
  const composerTerminalContexts = composerDraft.terminalContexts;
  const composerPastedTexts = composerDraft.pastedTexts;
  const composerSkills = composerDraft.skills;
  const composerMentions = composerDraft.mentions;
  const queuedComposerTurns = composerDraft.queuedTurns;
  const makeNoMistakeLevel = composerDraft.makeNoMistakeLevel ?? 0;
  const restoredSourceProposedPlan = composerDraft.restoredSourceProposedPlan;
  const composerSendState = useMemo(
    () =>
      deriveComposerSendState({
        prompt,
        imageCount: composerImages.length,
        fileCount: composerFiles.length,
        assistantSelectionCount: composerAssistantSelections.length,
        browserAnnotationCount: composerBrowserAnnotations.length,
        fileCommentCount: composerFileComments.length,
        terminalContexts: composerTerminalContexts,
        pastedTexts: composerPastedTexts,
      }),
    [
      composerAssistantSelections.length,
      composerBrowserAnnotations.length,
      composerFileComments.length,
      composerFiles.length,
      composerImages.length,
      composerTerminalContexts,
      composerPastedTexts,
      prompt,
    ],
  );
  const nonPersistedComposerImageIds = composerDraft.nonPersistedImageIds;
  const durablyPersistedComposerImageIds = composerDraft.persistedAttachments;
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setComposerDraftPromptHistorySavedDraft = useComposerDraftStore(
    (store) => store.setPromptHistorySavedDraft,
  );
  const restoreComposerDraftPromptHistorySavedDraft = useComposerDraftStore(
    (store) => store.restorePromptHistorySavedDraft,
  );
  const setComposerDraftModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const setComposerDraftProviderModelOptions = useComposerDraftStore(
    (store) => store.setProviderModelOptions,
  );
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const enqueueQueuedComposerTurn = useComposerDraftStore((store) => store.enqueueQueuedTurn);
  const insertQueuedComposerTurn = useComposerDraftStore((store) => store.insertQueuedTurn);
  const removeQueuedComposerTurnFromDraft = useComposerDraftStore(
    (store) => store.removeQueuedTurn,
  );
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const addComposerDraftFiles = useComposerDraftStore((store) => store.addFiles);
  const removeComposerDraftFile = useComposerDraftStore((store) => store.removeFile);
  const addComposerDraftAssistantSelection = useComposerDraftStore(
    (store) => store.addAssistantSelection,
  );
  const addComposerDraftBrowserAnnotations = useComposerDraftStore(
    (store) => store.addBrowserAnnotations,
  );
  const removeComposerDraftBrowserAnnotation = useComposerDraftStore(
    (store) => store.removeBrowserAnnotation,
  );
  const clearComposerDraftAssistantSelections = useComposerDraftStore(
    (store) => store.clearAssistantSelections,
  );
  const addComposerDraftFileComment = useComposerDraftStore((store) => store.addFileComment);
  const clearComposerDraftFileComments = useComposerDraftStore((store) => store.clearFileComments);
  const insertComposerDraftTerminalContext = useComposerDraftStore(
    (store) => store.insertTerminalContext,
  );
  const addComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.addTerminalContexts,
  );
  const removeComposerDraftTerminalContext = useComposerDraftStore(
    (store) => store.removeTerminalContext,
  );
  const addComposerDraftPastedTexts = useComposerDraftStore((store) => store.addPastedTexts);
  const removeComposerDraftPastedText = useComposerDraftStore((store) => store.removePastedText);
  const setComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.setTerminalContexts,
  );
  const setComposerDraftSkills = useComposerDraftStore((store) => store.setSkills);
  const setComposerDraftMentions = useComposerDraftStore((store) => store.setMentions);
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const syncComposerDraftPromptHistorySavedDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPromptHistorySavedDraftPersistedAttachments,
  );
  const setComposerDraftRestoredSourceProposedPlan = useComposerDraftStore(
    (store) => store.setRestoredSourceProposedPlan,
  );
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setComposerDraftMakeNoMistakeLevel = useComposerDraftStore(
    (store) => store.setMakeNoMistakeLevel,
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const moveDraftThreadToProject = useComposerDraftStore((store) => store.moveDraftThreadToProject);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const hasTemporaryThreadMarker = useTemporaryThreadStore((store) =>
    threadId ? store.temporaryThreadIds[threadId] === true : false,
  );
  const markTemporaryThread = useTemporaryThreadStore((store) => store.markTemporaryThread);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  const markWorkflowRunPaused = useWorkflowRunUiStore((store) => store.markPaused);
  const markWorkflowRunDismissed = useWorkflowRunUiStore((store) => store.markDismissed);
  const serverThread = useStore(useMemo(() => createThreadSelector(threadId), [threadId]));
  const threadDetailSyncState = useStore((state) =>
    threadId ? (state.threadDetailSyncById?.[threadId] ?? null) : null,
  );
  const composerThreadSummaries = useStore(
    useMemo(() => createComposerThreadMentionSourcesSelector(), []),
  );
  const composerThreadProjects = useStore((state) => state.projects);
  const crossTaskSourceThreadId =
    serverThread?.creationSource && serverThread.sourceThreadId
      ? serverThread.sourceThreadId
      : null;
  const crossTaskSourceThread = useStore(
    useMemo(() => createThreadSelector(crossTaskSourceThreadId), [crossTaskSourceThreadId]),
  );
  const crossTaskOrigin = useMemo(
    () =>
      crossTaskSourceThreadId
        ? {
            sourceThreadId: crossTaskSourceThreadId,
            sourceProvider: crossTaskSourceThread?.modelSelection.provider ?? null,
          }
        : null,
    [crossTaskSourceThread?.modelSelection.provider, crossTaskSourceThreadId],
  );
  const forkSourceThreadId = serverThread?.sidechatSourceThreadId
    ? null
    : (serverThread?.forkSourceThreadId ?? null);
  const forkSourceThread = useStore(
    useMemo(() => createThreadSelector(forkSourceThreadId), [forkSourceThreadId]),
  );
  const forkSource = useMemo(
    () =>
      forkSourceThreadId
        ? {
            sourceThreadId: forkSourceThreadId,
            sourceTitle: forkSourceThread?.title ?? "chat",
          }
        : null,
    [forkSourceThread?.title, forkSourceThreadId],
  );
  const fallbackDraftProjectId = draftThread?.projectId ?? null;
  const fallbackDraftProject = useStore(
    useMemo(() => createProjectSelector(fallbackDraftProjectId), [fallbackDraftProjectId]),
  );
  const promptRef = useRef(prompt);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const composerAssistantSelectionsRef = useRef<ComposerAssistantSelectionAttachment[]>(
    composerAssistantSelections,
  );
  const composerBrowserAnnotationsRef = useRef<BrowserAnnotationDraft[]>(
    composerBrowserAnnotations,
  );
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>(composerTerminalContexts);
  const composerFileCommentsRef = useRef<FileCommentDraft[]>(composerFileComments);
  const composerPastedTextsRef = useRef<PastedTextDraft[]>(composerPastedTexts);
  const [localDraftErrorsByThreadId, setLocalDraftErrorsByThreadId] = useState<
    Record<ThreadId, string | null>
  >({});

  const [isRevertingCheckpoint, setIsRevertingCheckpoint] = useState(false);
  const [pendingFileUndo, setPendingFileUndo] = useState<PendingFileUndo | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [respondingRequestKeys, setRespondingRequestKeys] = useState<string[]>([]);
  const [respondingUserInputRequestKeys, setRespondingUserInputRequestKeys] = useState<string[]>(
    [],
  );
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const pendingUserInputAnswersByRequestIdRef = useRef(pendingUserInputAnswersByRequestId);
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const [planSidebarOpen, setPlanSidebarOpen] = useState(false);
  const [activeTaskListCompact, setActiveTaskListCompact] = useState(false);
  const [subagentStripCompact, setSubagentStripCompact] = useState(false);
  const [workflowRunCardCompact, setWorkflowRunCardCompact] = useState(false);
  const [isComposerFooterCompact, setIsComposerFooterCompact] = useState(false);
  // Width-aware visibility for the footer picker cluster (context meter,
  // model name, traits label). Inputs live in a ref so the resize observer
  // can re-plan without re-subscribing; the sync function is exposed via ref
  // so label changes can re-plan without a resize.
  const [composerFooterTier, setComposerFooterTier] = useState(0);
  const composerFooterTierRef = useRef(0);
  const composerFooterDemotionWidthsRef = useRef<ReadonlyArray<number | undefined>>([]);
  const composerFooterLayoutSyncRef = useRef<(() => void) | null>(null);

  const [composerCommandPicker, setComposerCommandPicker] = useState<
    null | "fork-target" | "review-target"
  >(null);
  const [secondaryChromePlaceholderHeight, setSecondaryChromePlaceholderHeight] = useState(88);
  // Tracks whether the user explicitly dismissed the sidebar for the active turn.
  const planSidebarDismissedForTurnRef = useRef<string | null>(null);
  // When set, the thread-change reset effect will open the sidebar instead of closing it.
  // Used by "Implement in a new thread" to carry the sidebar-open intent across navigation.
  const planSidebarOpenOnNextThreadRef = useRef(false);
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  const [pullRequestDialogState, setPullRequestDialogState] =
    useState<PullRequestDialogState | null>(null);

  const [dismissedProviderHealthBannerKeys, setDismissedProviderHealthBannerKeys] = useLocalStorage(
    DISMISSED_PROVIDER_HEALTH_BANNERS_KEY,
    EMPTY_DISMISSED_PROVIDER_HEALTH_BANNERS,
    DismissedProviderHealthBannersSchema,
  );
  const [dismissedRateLimitBannerKey, setDismissedRateLimitBannerKey] = useState<string | null>(
    null,
  );
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isTraitsPickerOpen, setIsTraitsPickerOpen] = useState(false);
  const legendListRef = useRef<LegendListRef | null>(null);
  const timelineControllerRef = useRef<MessagesTimelineController | null>(null);
  const [threadFindOpen, setThreadFindOpen] = useState(false);
  const [threadFindFocusNonce, setThreadFindFocusNonce] = useState(0);
  const [threadFindHighlightStore] = useState(() => createThreadFindHighlightStore());
  const handleThreadFindJump = (match: ThreadFindMatch) => {
    timelineControllerRef.current?.scrollToMessage(match.messageId, {
      ...(match.segmentIndex === undefined ? {} : { segmentIndex: match.segmentIndex }),
      fineScrollFind: true,
    });
  };
  const handleThreadFindActiveMatchChange = (match: ThreadFindMatch | null) => {
    threadFindHighlightStore.setActiveMatch(match);
    timelineControllerRef.current?.setActiveFindMatch(match);
  };

  useEffect(() => {
    // Async setState (post-paint) keeps this thread-change reset out of the
    // render->effect->render cascade; the pickers already closed post-commit.
    const settle = window.setTimeout(() => {
      setComposerCommandPicker(null);
      setIsModelPickerOpen(false);
      setIsTraitsPickerOpen(false);
      setThreadFindOpen(false);
      threadFindHighlightStore.set(null);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [
    setComposerCommandPicker,
    setIsModelPickerOpen,
    setIsTraitsPickerOpen,
    setThreadFindOpen,
    threadId,
    threadFindHighlightStore,
  ]);

  const composerFormRef = useRef<HTMLFormElement>(null);
  // Set by whichever mounted GitActionsControl instance (header quick-action or the
  // Environment panel row) last registered — either performs the identical commit &
  // push mutation for this thread's repo, so it doesn't matter which one is "current".
  const commitAndPushTriggerRef = useRef<(() => void) | null>(null);
  const onRegisterCommitAndPushTrigger = useCallback(
    (trigger: (() => void) | null) => {
      commitAndPushTriggerRef.current = trigger;
    },
    [commitAndPushTriggerRef],
  );
  const pendingComposerFocusRef = useRef(false);

  const composerFormHeightRef = useRef(0);

  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);

  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const localDirectoryMenuRef = useRef<ComposerLocalDirectoryMenuHandle | null>(null);

  const sendInFlightRef = useRef(false);
  const sendPreflightInFlightRef = useRef(false);
  const dragDepthRef = useRef(0);
  const terminalOpenByThreadRef = useRef<Record<string, boolean>>({});
  const activatedThreadIdRef = useRef<ThreadId | null>(null);

  useEffect(() => {
    restoredQueuedSourceProposedPlanRef.current = restoredSourceProposedPlan ?? null;
  }, [restoredSourceProposedPlan]);

  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(threadId, nextPrompt);
    },
    [setComposerDraftPrompt, threadId],
  );
  const discardPromptHistoryNavigationForComposerMutation = useCallback(() => {
    if (promptHistoryNavigationRef.current === null) {
      return;
    }
    // Attachment edits mean the recalled prompt is now the user's draft; do not restore the old one.
    promptHistoryNavigationRef.current = null;
    applyingPromptHistoryNavigationRef.current = false;
    expectedPromptHistoryPromptRef.current = null;
    promptHistoryAppliedPromptRef.current = null;
    setComposerDraftPromptHistorySavedDraft(threadId, null);
  }, [setComposerDraftPromptHistorySavedDraft, threadId]);
  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => {
      discardPromptHistoryNavigationForComposerMutation();
      return addComposerDraftImages(threadId, images);
    },
    [addComposerDraftImages, discardPromptHistoryNavigationForComposerMutation, threadId],
  );
  const addComposerFilesToDraft = useCallback(
    (files: ComposerFileAttachment[]) => {
      discardPromptHistoryNavigationForComposerMutation();
      return addComposerDraftFiles(threadId, files);
    },
    [addComposerDraftFiles, discardPromptHistoryNavigationForComposerMutation, threadId],
  );
  const addComposerAssistantSelectionToDraft = useCallback(
    (selection: ComposerAssistantSelectionAttachment) => {
      discardPromptHistoryNavigationForComposerMutation();
      return addComposerDraftAssistantSelection(threadId, selection);
    },
    [
      addComposerDraftAssistantSelection,
      discardPromptHistoryNavigationForComposerMutation,
      threadId,
    ],
  );
  const addComposerTerminalContextsToDraft = useCallback(
    (contexts: TerminalContextDraft[]) => {
      discardPromptHistoryNavigationForComposerMutation();
      addComposerDraftTerminalContexts(threadId, contexts);
    },
    [addComposerDraftTerminalContexts, discardPromptHistoryNavigationForComposerMutation, threadId],
  );
  const addComposerPastedTextsToDraft = useCallback(
    (pastedTexts: PastedTextDraft[]) => {
      discardPromptHistoryNavigationForComposerMutation();
      addComposerDraftPastedTexts(threadId, pastedTexts);
    },
    [addComposerDraftPastedTexts, discardPromptHistoryNavigationForComposerMutation, threadId],
  );
  const addComposerFileCommentToDraft = useCallback(
    (comment: FileCommentDraft) => {
      discardPromptHistoryNavigationForComposerMutation();
      addComposerDraftFileComment(threadId, comment);
    },
    [addComposerDraftFileComment, discardPromptHistoryNavigationForComposerMutation, threadId],
  );
  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      discardPromptHistoryNavigationForComposerMutation();
      removeComposerDraftImage(threadId, imageId);
    },
    [discardPromptHistoryNavigationForComposerMutation, removeComposerDraftImage, threadId],
  );
  const clearComposerAssistantSelectionsFromDraft = useCallback(() => {
    discardPromptHistoryNavigationForComposerMutation();
    clearComposerDraftAssistantSelections(threadId);
  }, [
    clearComposerDraftAssistantSelections,
    discardPromptHistoryNavigationForComposerMutation,
    threadId,
  ]);
  const clearComposerFileCommentsFromDraft = useCallback(() => {
    discardPromptHistoryNavigationForComposerMutation();
    clearComposerDraftFileComments(threadId);
  }, [clearComposerDraftFileComments, discardPromptHistoryNavigationForComposerMutation, threadId]);
  const removeComposerTerminalContextFromDraft = useCallback(
    (contextId: string) => {
      discardPromptHistoryNavigationForComposerMutation();
      const contextIndex = composerTerminalContexts.findIndex(
        (context) => context.id === contextId,
      );
      if (contextIndex < 0) {
        return;
      }
      const nextPrompt = removeInlineTerminalContextPlaceholder(promptRef.current, contextIndex);
      promptRef.current = nextPrompt.prompt;
      setPrompt(nextPrompt.prompt);
      removeComposerDraftTerminalContext(threadId, contextId);
      setComposerCursor(nextPrompt.cursor);
      setComposerTrigger(
        detectComposerTrigger(
          nextPrompt.prompt,
          expandCollapsedComposerCursor(nextPrompt.prompt, nextPrompt.cursor),
        ),
      );
    },
    [
      composerTerminalContexts,
      discardPromptHistoryNavigationForComposerMutation,
      removeComposerDraftTerminalContext,
      setPrompt,
      threadId,
    ],
  );
  const removeComposerPastedTextFromDraft = useCallback(
    (pastedTextId: string) => {
      discardPromptHistoryNavigationForComposerMutation();
      removeComposerDraftPastedText(threadId, pastedTextId);
    },
    [discardPromptHistoryNavigationForComposerMutation, removeComposerDraftPastedText, threadId],
  );
  const removeComposerBrowserAnnotationFromDraft = useCallback(
    (annotationId: string) => {
      discardPromptHistoryNavigationForComposerMutation();
      removeComposerDraftBrowserAnnotation(threadId, annotationId);
    },
    [
      discardPromptHistoryNavigationForComposerMutation,
      removeComposerDraftBrowserAnnotation,
      threadId,
    ],
  );
  // "Show in text field": drop the full pasted text back into the editor (appended
  // to the current prompt) and discard the card so it can be edited as normal text.
  const showComposerPastedTextInField = useCallback(
    (pastedTextId: string) => {
      const pasted = composerPastedTexts.find((entry) => entry.id === pastedTextId);
      if (!pasted) {
        return;
      }
      discardPromptHistoryNavigationForComposerMutation();
      const current = promptRef.current;
      const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      const nextPrompt = `${current}${separator}${pasted.text}`;
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      removeComposerDraftPastedText(threadId, pastedTextId);
      setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAtEnd();
      });
    },
    [
      composerPastedTexts,
      discardPromptHistoryNavigationForComposerMutation,
      removeComposerDraftPastedText,
      setPrompt,
      threadId,
    ],
  );

  const localDraftError = serverThread ? null : (localDraftErrorsByThreadId[threadId] ?? null);
  const localDraftThread = useMemo(
    () =>
      draftThread
        ? buildLocalDraftThread(
            threadId,
            draftThread,
            fallbackDraftProject?.defaultModelSelection ?? {
              provider: "codex",
              model: DEFAULT_MODEL_BY_PROVIDER.codex,
            },
            localDraftError,
          )
        : undefined,
    [draftThread, fallbackDraftProject?.defaultModelSelection, localDraftError, threadId],
  );
  const activeThread = serverThread ?? localDraftThread;
  // Local threads reconcile their stored branch to the shared checkout as soon as the
  // branch query resolves. Keep the branch seen when a thread becomes active so a settled
  // thread can explain that change before the user's first resumed message.
  const [activeThreadBranchAtActivation, setActiveThreadBranchAtActivation] = useState<{
    threadId: ThreadId;
    branch: string | null;
    isSettled: boolean;
  } | null>(null);
  const [
    settledThreadBranchWarningDismissedThreadId,
    setSettledThreadBranchWarningDismissedThreadId,
  ] = useState<ThreadId | null>(null);
  useEffect(() => {
    if (!activeThread || activeThreadBranchAtActivation?.threadId === activeThread.id) {
      return;
    }
    setActiveThreadBranchAtActivation({
      threadId: activeThread.id,
      branch: activeThread.branch,
      isSettled: activeThread.settledAt != null,
    });
    setSettledThreadBranchWarningDismissedThreadId(null);
  }, [activeThread, activeThreadBranchAtActivation?.threadId]);
  const settledThreadBranchAtActivation =
    activeThreadBranchAtActivation !== null &&
    activeThreadBranchAtActivation.threadId === activeThread?.id &&
    activeThreadBranchAtActivation.isSettled
      ? activeThreadBranchAtActivation.branch
      : activeThread?.branch;
  useEffect(() => {
    if (
      !pendingFileUndo ||
      !hasFileUndoSettled({ pending: pendingFileUndo, thread: activeThread ?? null })
    ) {
      return;
    }
    // Async setState (post-paint) keeps this settled-undo cleanup out of the
    // render->effect->render cascade.
    const settle = window.setTimeout(() => {
      setPendingFileUndo(null);
      setIsRevertingCheckpoint(false);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [setIsRevertingCheckpoint, setPendingFileUndo, activeThread, pendingFileUndo]);
  const runtimeMode =
    composerDraft.runtimeMode ?? activeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;

  const interactionMode =
    composerDraft.interactionMode ?? activeThread?.interactionMode ?? DEFAULT_INTERACTION_MODE;
  const isServerThread = serverThread !== undefined;
  const isLocalDraftThread = !isServerThread && localDraftThread !== undefined;
  const canCheckoutPullRequestIntoThread = isLocalDraftThread;
  const diffOpen = rawSearch.panel === "diff";
  const browserOpen = rawSearch.panel === "browser";
  const resolvedDiffOpen = panelState ? panelState.panel === "diff" : diffOpen;
  const activeThreadId = activeThread?.id ?? null;
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  // Read once here so memo bodies depend on the turn id instead of the turn object: a
  // `foo?.bar` read inside a memo makes React Compiler infer `foo` as the dependency, which
  // no longer matches the hand-written `foo?.bar` dep and bails the whole component out.
  const activeLatestTurnId = activeLatestTurn?.turnId ?? null;
  const activeLatestTurnState = activeLatestTurn?.state ?? null;
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  useEffect(() => {
    recordBullyModeAchievements(threadActivities);
  }, [threadActivities]);
  const hasLiveTurnTail = hasLiveTurnTailWork({
    latestTurn: activeLatestTurn,
    messages: activeThread?.messages ?? EMPTY_MESSAGES,
    activities: threadActivities,
    session: activeThread?.session ?? null,
  });
  const activeContextWindowState = useMemo(
    () => deriveLatestContextWindowState(threadActivities),
    [threadActivities],
  );
  const activeContextWindow = activeContextWindowState.snapshot;
  const activeCumulativeCostUsd = useMemo(
    () => deriveCumulativeCostUsd(threadActivities),
    [threadActivities],
  );
  const activeRateLimitStatus = useMemo(
    () => deriveLatestRateLimitStatus(threadActivities),
    [threadActivities],
  );
  const activeRateLimitBannerDismissalKey = useMemo(
    () => getRateLimitBannerDismissalKey(activeRateLimitStatus, activeThread?.id ?? null),
    [activeRateLimitStatus, activeThread?.id],
  );
  const visibleActiveRateLimitStatus =
    activeRateLimitBannerDismissalKey === dismissedRateLimitBannerKey
      ? null
      : activeRateLimitStatus;
  const latestTurnSettledByProvider = isLatestTurnSettled(
    activeLatestTurn,
    activeThread?.session ?? null,
  );
  const latestTurnSettled = latestTurnSettledByProvider && !hasLiveTurnTail;
  // `latestTurnSettled` is also false when there is NO started turn (a brand-new
  // chat), because `isLatestTurnSettled` treats a non-existent turn as unsettled.
  // Gate live-turn UI on an actually-started turn so composer chrome cannot
  // appear on a fresh chat just because the repo already has local edits.
  const latestTurnLive = Boolean(activeLatestTurn?.startedAt) && !latestTurnSettled;
  const activeProjectId = activeThread?.projectId ?? draftThread?.projectId ?? null;
  const activeProject = useStore(
    useMemo(() => createProjectSelector(activeProjectId), [activeProjectId]),
  );
  const deletePlaceholderTerminalThread = useCallback(
    async (terminalThreadId: ThreadId) => {
      const api = readNativeApi();
      if (!api) return;
      // Body kept in a nested function: React Compiler's BuildHIR cannot lower a value block
      // (`?.`, `??`, ternary) that sits directly inside a `try`, and one of them makes the
      // whole component bail out of compilation. The catch below still sees every rejection.
      const deleteEmptyTerminalThread = async () => {
        await api.orchestration.dispatchCommand({
          type: "thread.delete",
          commandId: newCommandId(),
          threadId: terminalThreadId,
        });
        void reconcileDeletedThreadFromClient({
          threadId: terminalThreadId,
          removeDeletedThreadFromClientState:
            useStore.getState().removeDeletedThreadFromClientState,
        });
        useComposerDraftStore.getState().clearDraftThread(terminalThreadId);
        useTerminalStateStore.getState().clearTerminalState(terminalThreadId);
        removeThreadFromSplitViews(terminalThreadId);
        if (activeSplitView) {
          const nextSplitView = useSplitViewStore.getState().splitViewsById[activeSplitView.id];
          const nextThreadId = nextSplitView
            ? resolveSplitViewFocusedThreadId(nextSplitView)
            : null;
          if (nextSplitView && nextThreadId) {
            await navigate({
              to: "/$threadId",
              params: { threadId: nextThreadId },
              replace: true,
              search: () => ({ splitViewId: nextSplitView.id }),
            });
            return;
          }
        }
        await handleNewChat();
      };

      try {
        await deleteEmptyTerminalThread();
      } catch (error) {
        console.error("Failed to delete empty terminal thread after closing its last terminal", {
          threadId: terminalThreadId,
          error,
        });
      }
    },
    [activeSplitView, handleNewChat, navigate, removeThreadFromSplitViews],
  );
  const {
    terminalState,
    terminalFocusRequestId,
    requestTerminalFocus,
    terminalWorkspaceOpen,
    terminalWorkspaceTerminalTabActive,
    terminalWorkspaceChatTabActive,
    setTerminalOpen,
    setTerminalPresentationMode,
    setTerminalWorkspaceLayout,
    setTerminalWorkspaceTab,
    setTerminalHeight,
    setTerminalMetadataInStore: storeSetTerminalMetadata,
    setTerminalActivityInStore: storeSetTerminalActivity,
    openChatThreadPageInStore: storeOpenChatThreadPage,
    openTerminalThreadPageInStore: storeOpenTerminalThreadPage,
    closeTerminalGroupInStore: storeCloseTerminalGroup,
    resizeTerminalSplitInStore: storeResizeTerminalSplit,
    toggleTerminalVisibility,
    expandTerminalWorkspace,
    collapseTerminalWorkspace,
    splitTerminalLeft,
    splitTerminalRight,
    splitTerminalDown,
    splitTerminalUp,
    createNewTerminal,
    createNewTerminalTab,
    createTerminalFromShortcut,
    moveTerminalToNewGroup,
    openNewFullWidthTerminal,
    activateTerminal,
    closeTerminal,
    handleTerminalSessionExited,
    closeActiveWorkspaceView,
  } = useChatTerminalController({
    threadId,
    activeThreadId,
    activeThread,
    activeProjectPresent: activeProject !== undefined,
    isFocusedPane,
    isServerThread,
    confirmTerminalClose: settings.confirmTerminalTabClose,
    onDeletePlaceholderThread: deletePlaceholderTerminalThread,
  });
  const projectInstructions = useProjectInstructionsStore((state) =>
    activeProjectId ? (state.instructionsByProjectId[activeProjectId] ?? "") : "",
  );
  const setProjectInstructions = useProjectInstructionsStore((state) => state.setInstructions);
  const homeDir = useWorkspacePathsStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspacePathsStore((state) => state.chatWorkspaceRoot);
  const studioWorkspaceRoot = useWorkspacePathsStore((state) => state.studioWorkspaceRoot);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const isHomeChatContainer = isHomeChatContainerProject(activeProject, {
    homeDir,
    chatWorkspaceRoot,
  });
  const isStudioContainer = isStudioContainerProject(activeProject, {
    homeDir,
    chatWorkspaceRoot,
    studioWorkspaceRoot,
  });
  const isContainerLandingProject = isHomeChatContainer || isStudioContainer;
  const activeProjectDisplayName = isHomeChatContainer
    ? activeProject?.folderName
    : activeProject?.name;
  const isChatProject = isContainerLandingProject;
  const activeProjectScripts =
    activeProject?.kind === "project" ? activeProject.scripts : undefined;
  const threadLineageThreads = useStore(
    useMemo(() => createThreadLineageSelector(activeThread?.id ?? null), [activeThread?.id]),
  );
  const threadBreadcrumbs = useMemo(
    () => buildThreadBreadcrumbs(threadLineageThreads, activeThread),
    [activeThread, threadLineageThreads],
  );
  // Studio threads are always local. Their optional "Use a folder" cwd is stored separately
  // from Git worktree metadata; the server migration repairs the legacy mixed representation.
  const resolvedThreadEnvMode = isStudioContainer
    ? "local"
    : isServerThread
      ? (activeThread?.envMode ?? null)
      : (draftThread?.envMode ?? null);
  const resolvedThreadWorktreePath = isStudioContainer
    ? null
    : isServerThread
      ? (activeThread?.worktreePath ?? null)
      : (draftThread?.worktreePath ?? null);
  const resolvedThreadWorkingDirectory = isServerThread
    ? (activeThread?.workingDirectory ?? null)
    : (draftThread?.workingDirectory ?? null);
  const diffEnvironmentState = resolveDiffEnvironmentState({
    projectCwd: activeProject?.cwd ?? null,
    envMode: resolvedThreadEnvMode,
    worktreePath: resolvedThreadWorktreePath,
  });
  const diffEnvironmentPending = diffEnvironmentState.pending;
  const diffDisabledReason = diffEnvironmentState.disabledReason;
  const repoDiffBadgeRefreshIntervalMs =
    isFocusedPane && latestTurnLive && !diffEnvironmentPending && !resolvedDiffOpen
      ? GIT_WORKING_TREE_DIFF_LIVE_REFETCH_INTERVAL_MS
      : false;
  const activeThreadAssociatedWorktree = useMemo(
    () =>
      deriveAssociatedWorktreeMetadata({
        branch: activeThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? null,
        ...(activeThread?.associatedWorktreePath !== undefined
          ? { associatedWorktreePath: activeThread.associatedWorktreePath }
          : {}),
        ...(activeThread?.associatedWorktreeBranch !== undefined
          ? { associatedWorktreeBranch: activeThread.associatedWorktreeBranch }
          : {}),
        ...(activeThread?.associatedWorktreeRef !== undefined
          ? { associatedWorktreeRef: activeThread.associatedWorktreeRef }
          : {}),
      }),
    [activeThread],
  );

  const openPullRequestDialog = useCallback(
    (reference?: string) => {
      if (!canCheckoutPullRequestIntoThread) {
        return;
      }
      setPullRequestDialogState({
        initialReference: reference ?? null,
        key: Date.now(),
      });
      setComposerHighlightedItemId(null);
    },
    [setComposerHighlightedItemId, setPullRequestDialogState, canCheckoutPullRequestIntoThread],
  );

  const closePullRequestDialog = useCallback(() => {
    setPullRequestDialogState(null);
  }, [setPullRequestDialogState]);

  const openOrReuseProjectDraftThread = useCallback(
    async (input: {
      branch: string;
      worktreePath: string | null;
      envMode: DraftThreadEnvMode;
      lastKnownPr?: Thread["lastKnownPr"];
    }) => {
      if (!activeProject) {
        throw new Error("No active project is available for this pull request.");
      }
      const draftThreadContext = {
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.envMode,
        ...(input.lastKnownPr !== undefined ? { lastKnownPr: input.lastKnownPr } : {}),
      };
      const storedDraftThread = getDraftThreadByProjectId(activeProject.id);
      if (storedDraftThread) {
        setDraftThreadContext(storedDraftThread.threadId, draftThreadContext);
        setProjectDraftThreadId(activeProject.id, storedDraftThread.threadId, draftThreadContext);
        if (storedDraftThread.threadId !== threadId) {
          await navigate({
            to: "/$threadId",
            params: { threadId: storedDraftThread.threadId },
          });
        }
        return;
      }

      const activeDraftThread = getDraftThread(threadId);
      if (
        !isServerThread &&
        activeDraftThread?.projectId === activeProject.id &&
        activeDraftThread.entryPoint === "chat"
      ) {
        setDraftThreadContext(threadId, draftThreadContext);
        setProjectDraftThreadId(activeProject.id, threadId, draftThreadContext);
        return;
      }

      clearProjectDraftThreadId(activeProject.id);
      const nextThreadId = newThreadId();
      setProjectDraftThreadId(activeProject.id, nextThreadId, {
        ...draftThreadContext,
        createdAt: new Date().toISOString(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
      });
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });
    },
    [
      activeProject,
      clearProjectDraftThreadId,
      getDraftThread,
      getDraftThreadByProjectId,
      isServerThread,
      navigate,
      setDraftThreadContext,
      setProjectDraftThreadId,
      threadId,
    ],
  );

  const handlePreparedPullRequestThread = useCallback(
    async (input: {
      branch: string;
      worktreePath: string | null;
      pullRequest: NonNullable<Thread["lastKnownPr"]>;
    }) => {
      await openOrReuseProjectDraftThread({
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.worktreePath ? "worktree" : "local",
        lastKnownPr: input.pullRequest,
      });
    },
    [openOrReuseProjectDraftThread],
  );

  useEffect(() => {
    if (!activeThread?.id) return;
    if (!latestTurnSettled) return;
    if (!activeLatestTurn?.completedAt) return;
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnCompletedAt)) return;
    const lastVisitedAt = activeThread.lastVisitedAt ? Date.parse(activeThread.lastVisitedAt) : NaN;
    if (!Number.isNaN(lastVisitedAt) && lastVisitedAt >= turnCompletedAt) return;

    markThreadVisited(activeThread.id);
  }, [
    activeThread?.id,
    activeThread?.lastVisitedAt,
    activeLatestTurn?.completedAt,
    latestTurnSettled,
    markThreadVisited,
  ]);

  const {
    hasThreadStarted,
    lockedProvider,
    serverConfigQuery,
    selectedProvider,
    providerModelDiscoveryCwd,
    customModelsByProvider,
    modelOptionsByProvider,
    loadingModelProviders,
    runtimeModelsByProvider,
    dynamicAgents,
    selectedProviderRuntimeModelDiscoveryPending,
    composerModelOptions,
    selectedModel,
    selectedRuntimeModel,
    composerProviderState,
    selectedPromptEffort,
    selectedModelSelection,
    providerOptionsForDispatch,
    selectedModelForPickerWithCustomFallback,
    showComposerModelBootstrapSkeleton,
    searchableModelOptions,
  } = useChatProviderModels({
    threadId,
    activeThread,
    activeProject,
    composerDraft,
    settings,
    isModelPickerOpen,
    resolvedThreadWorktreePath,
  });
  const featureFlags = useFeatureFlags();
  const showDebugTaskBanner = import.meta.env.DEV && featureFlags["show-debug-task-banner"];
  const serverSettingsQuery = useQuery(serverSettingsQueryOptions());

  const phase = derivePhase(activeThread?.session ?? null);
  const isConnecting = phase === "connecting";
  const providerDisplayName =
    PROVIDER_DISPLAY_NAMES[activeThread?.session?.provider ?? selectedProvider];
  const { workLogEntries, composerSubagentStripItems, stripSourceThreadId, workflowRunState } =
    useChatWorkLog({
      activeThread,
      latestTurnSettled,
      latestTurnLive,
    });
  const [openAgentActivityId, setOpenAgentActivityId] = useState<string | null>(null);
  const agentActivityTimelineState = useMemo(
    () => deriveAgentActivityTimelineState(workLogEntries),
    [workLogEntries],
  );
  const openAgentActivityDetail = openAgentActivityId
    ? (agentActivityTimelineState.detailById.get(openAgentActivityId) ?? null)
    : null;
  useEffect(() => {
    // Async setState (post-paint) keeps this thread-change reset out of the
    // render->effect->render cascade.
    const settle = window.setTimeout(() => {
      setOpenAgentActivityId(null);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [setOpenAgentActivityId, activeThread?.id]);
  useEffect(() => {
    if (!openAgentActivityId || agentActivityTimelineState.detailById.has(openAgentActivityId)) {
      return;
    }
    // Async setState (post-paint) keeps this stale-detail cleanup out of the
    // render->effect->render cascade.
    const settle = window.setTimeout(() => {
      setOpenAgentActivityId(null);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [agentActivityTimelineState.detailById, openAgentActivityId]);
  const pendingApprovals = useMemo(
    () =>
      derivePendingApprovals(threadActivities, activeThread?.pendingInteractions, {
        authoritativeHasPending: activeThread?.hasPendingApprovals,
        latestTurnId: activeThread?.latestTurn?.turnId,
      }),
    [
      activeThread?.hasPendingApprovals,
      activeThread?.latestTurn?.turnId,
      activeThread?.pendingInteractions,
      threadActivities,
    ],
  );
  const nextUserInputResponseReclaimAt = useMemo(() => {
    let earliest: string | null = null;
    for (const interaction of activeThread?.pendingInteractions ?? []) {
      if (interaction.interactionKind !== "userInput" || interaction.status !== "responding") {
        continue;
      }
      if (interaction.responseRequestedAt === null) {
        return new Date(0).toISOString();
      }
      const reclaimAt = respondingInteractionReclaimAt(interaction.responseRequestedAt);
      if (earliest === null || reclaimAt < earliest) {
        earliest = reclaimAt;
      }
    }
    return earliest;
  }, [activeThread?.pendingInteractions]);
  const [userInputResponseClaimReferenceAt, setUserInputResponseClaimReferenceAt] = useState(() =>
    new Date().toISOString(),
  );
  useEffect(() => {
    if (nextUserInputResponseReclaimAt === null) {
      return;
    }
    const delayMs = Math.max(0, Date.parse(nextUserInputResponseReclaimAt) - Date.now());
    const timeoutId = window.setTimeout(() => {
      setUserInputResponseClaimReferenceAt(new Date().toISOString());
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [nextUserInputResponseReclaimAt]);
  const pendingUserInputs = useMemo(
    () =>
      derivePendingUserInputs(threadActivities, activeThread?.pendingInteractions, {
        authoritativeHasPending: activeThread?.hasPendingUserInput,
        latestTurnId: activeThread?.latestTurn?.turnId,
        responseClaimReferenceAt: userInputResponseClaimReferenceAt,
      }),
    [
      activeThread?.hasPendingUserInput,
      activeThread?.latestTurn?.turnId,
      activeThread?.pendingInteractions,
      threadActivities,
      userInputResponseClaimReferenceAt,
    ],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingUserInputKey = activePendingUserInput
    ? pendingRequestInstanceKey(
        activePendingUserInput.requestId,
        activePendingUserInput.lifecycleGeneration,
      )
    : null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInputKey
        ? (pendingUserInputAnswersByRequestId[activePendingUserInputKey] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInputKey, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInputKey
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInputKey] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  // Read once here for the same reason as `activeLatestTurnId`: an `activePendingProgress?.x`
  // read inside a memo body makes React Compiler infer `activePendingProgress` as the
  // dependency, which no longer matches the hand-written property-path dep.
  const activePendingQuestion = activePendingProgress?.activeQuestion ?? null;
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInputKey
    ? respondingUserInputRequestKeys.includes(activePendingUserInputKey)
    : false;
  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);
  const sidebarPlanSourceThreadId = !latestTurnSettled
    ? (activeLatestTurn?.sourceProposedPlan?.threadId ?? null)
    : null;
  const sidebarPlanSourceThread = useStore(
    useMemo(() => createThreadSelector(sidebarPlanSourceThreadId), [sidebarPlanSourceThreadId]),
  );
  const activeThreadPlanThreadId = activeThread?.id ?? null;
  const activeThreadPlanProposedPlans = activeThread?.proposedPlans;
  const sidebarPlanSourceThreadPlanId = sidebarPlanSourceThread?.id ?? null;
  const sidebarPlanSourceThreadProposedPlans = sidebarPlanSourceThread?.proposedPlans;
  const sidebarProposedPlan = useMemo(
    () =>
      findSidebarProposedPlan({
        threads: [
          ...(activeThreadPlanThreadId
            ? [
                {
                  id: activeThreadPlanThreadId,
                  proposedPlans: activeThreadPlanProposedPlans ?? [],
                },
              ]
            : []),
          ...(sidebarPlanSourceThreadPlanId &&
          sidebarPlanSourceThreadPlanId !== activeThreadPlanThreadId
            ? [
                {
                  id: sidebarPlanSourceThreadPlanId,
                  proposedPlans: sidebarPlanSourceThreadProposedPlans ?? [],
                },
              ]
            : []),
        ],
        latestTurn: activeLatestTurn,
        latestTurnSettled,
        threadId: activeThreadPlanThreadId,
      }),
    [
      activeLatestTurn,
      activeThreadPlanProposedPlans,
      activeThreadPlanThreadId,
      latestTurnSettled,
      sidebarPlanSourceThreadPlanId,
      sidebarPlanSourceThreadProposedPlans,
    ],
  );
  const planSidebarLabel = sidebarProposedPlan ? "Plan details" : "Tasks";
  const planSidebarToggleLabel = planSidebarOpen ? `Hide ${planSidebarLabel}` : planSidebarLabel;
  const planSidebarToggleTitle = `${planSidebarOpen ? "Hide" : "Show"} ${planSidebarLabel.toLowerCase()} sidebar`;
  const activeTaskList = useMemo((): ActiveTaskListState | null => {
    if (showDebugTaskBanner) {
      return {
        createdAt: new Date().toISOString(),
        turnId: activeLatestTurn?.turnId ?? null,
        tasks: [
          {
            task: "Inspect banner layout without overlapping transcript text",
            status: "inProgress",
          },
          {
            task: "Confirm compact task banner width",
            status: "pending",
          },
          {
            task: "Verify sidebar task controls",
            status: "completed",
          },
        ],
      };
    }

    // Only while a turn is live: deriveActiveTaskListState falls back to the latest
    // unfinished prior-turn list (follow-up turns, reloads mid-turn), but once the
    // thread is idle the card must clear — providers routinely end a turn without
    // marking every task completed, and an unfinished list must not linger forever.
    return latestTurnSettled
      ? null
      : deriveActiveTaskListState(threadActivities, activeLatestTurn?.turnId);
  }, [activeLatestTurn?.turnId, latestTurnSettled, showDebugTaskBanner, threadActivities]);
  const activeBackgroundTasks = useMemo(
    () =>
      latestTurnSettled
        ? null
        : deriveActiveBackgroundTasksState(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, latestTurnSettled, threadActivities],
  );

  const showPlanFollowUpPrompt =
    pendingUserInputs.length === 0 &&
    interactionMode === "plan" &&
    latestTurnSettled &&
    hasActionableProposedPlan(activeProposedPlan);

  const {
    localDispatch,
    setLocalDispatch,
    worktreeSetupResolutionRef,
    worktreeSetupPendingAction,
    setWorktreeSetupPendingAction,
    turnTakenOver,
    isSendBusy,
    isAwaitingTurnStart,
    activeWorktreeSetup,
    isPreparingWorktree,
    beginLocalDispatch,
    failLocalDispatchWorktreeSetup,
    resetLocalDispatch,
    clearLocalDispatchWorktreeSetup,
    onResolveWorktreeSetup,
    armLocalDispatchAckFallback,
    scheduleFailedWorktreeSetupDispatchReset,
  } = useChatLocalDispatch({
    phase,
    activeLatestTurn,
    activeThread,
    activePendingApproval,
    activePendingUserInput,
  });
  const hasLiveTurn = phase === "running";
  // Providers that clear `activeTurnId` on every terminal event (Claude) would
  // otherwise leave the transcript with no active turn while work is still in
  // progress, collapsing the newest answer into a closed "Worked for" disclosure.
  // The latest turn is the transcript's own notion of "current", so fall back to it.
  const activeTurnIdForTranscript = activeThread?.session?.activeTurnId ?? activeLatestTurnId;
  // The edit affordance must mirror the exact policy the server decider applies:
  // resolve the editable target from the raw sequence-ordered thread messages and
  // the running-session turn id — never from the createdAt-sorted timeline rows,
  // whose optimistic/filtered entries can surface the button on a message the
  // validators then reject.
  const editableUserMessageId = useMemo(() => {
    if (!activeThread || !isServerThread) {
      return null;
    }
    const editTarget = resolveLatestTailUserMessageEditTarget({
      messages: activeThread.messages,
      activeTurnId:
        activeThread.session?.orchestrationStatus === "running"
          ? (activeThread.session.activeTurnId ?? null)
          : null,
    });
    return editTarget.editable ? (editTarget.messageId as MessageId) : null;
  }, [activeThread, isServerThread]);
  // Defence in depth against a session stuck at "running" with no turn to
  // complete: nothing would ever drain the composer queue, so messages routed
  // into it would be swallowed. Server-side reconciliation settles these
  // sessions; this keeps the composer usable until it does.
  const hasQueueableLiveTurn = hasLiveTurn && activeThread?.session?.activeTurnId != null;
  const {
    automationProjects,
    automationThreads,
    automationData,
    automationDraftForm,
    setAutomationDraftForm,
    automationDraftWarnings,
    setAutomationDraftWarnings,
    setAutomationDraftWarningContext,
    acknowledgedAutomationWarnings,
    setAcknowledgedAutomationWarnings,
    automationDraftOpen,
    setAutomationDraftOpen,
    setAutomationDraftDialogOpen,
    isAutomationDraftSubmitting,
    setIsAutomationDraftSubmitting,
    automationDraftSubmittingRef,
    pendingAutomationConversation,
    setPendingAutomationConversation,
    activeThreadIdRef,
    pendingAutomationConversationRef,
    hasLiveTurnRef,
    isPendingSetupBubbleId,
    cancelAutomationConversation,
    toggleAutomationWarning,
    updateAutomationDraftForm,
    resetAutomationDraftState,
  } = useChatAutomationSetup({
    threadId,
    hasLiveTurn,
    promptRef,
    setComposerDraftPrompt,
  });
  // Keep Thinking through the post-ack gap where the server has the message /
  // turn request but the provider session is not live yet (common on first send).
  const isWorking =
    hasLiveTurn || isSendBusy || isConnecting || isRevertingCheckpoint || isAwaitingTurnStart;
  const hasStreamingAssistantText =
    activeThread?.messages.some((message) => message.role === "assistant" && message.streaming) ??
    false;
  const activeTurnLayoutLive = isWorking || !latestTurnSettled;
  const [keepSettledActiveTurnLayout, setKeepSettledActiveTurnLayout] = useState(false);
  const previousActiveTurnLayoutLiveRef = useRef(activeTurnLayoutLive);
  const previousActiveTurnLayoutKeyRef = useRef<string | null>(null);
  const activeWorkStartedAt = hasLiveTurnTail
    ? (activeLatestTurn?.startedAt ?? null)
    : hasLiveTurn
      ? deriveActiveWorkStartedAt(activeLatestTurn, activeThread?.session ?? null, null)
      : null;
  const activeTurnLayoutKey =
    activeThreadId === null ? null : `${activeThreadId}:${activeLatestTurn?.turnId ?? "idle"}`;
  const activeTurnInProgress = activeTurnLayoutLive || keepSettledActiveTurnLayout;
  const isComposerApprovalState = activePendingApproval !== null;
  const isComposerEditorDisabled = isConnecting || isComposerApprovalState;
  const canCollapsePastedTextToDraft = shouldEnableComposerPastedTextCollapse({
    isComposerApprovalState,
    hasPendingUserInput: pendingUserInputs.length > 0,
    showPlanFollowUpPrompt,
  });
  const composerFooterHasWideActions = showPlanFollowUpPrompt || activePendingProgress !== null;
  const handoffDisabled = !(
    activeThread &&
    activeProject &&
    isServerThread &&
    canCreateThreadHandoff({
      thread: activeThread,
      isBusy: isWorking,
      hasPendingApprovals: pendingApprovals.length > 0,
      hasPendingUserInput: pendingUserInputs.length > 0,
    })
  );

  useLayoutEffect(() => {
    if (previousActiveTurnLayoutKeyRef.current !== activeTurnLayoutKey) {
      previousActiveTurnLayoutKeyRef.current = activeTurnLayoutKey;
      previousActiveTurnLayoutLiveRef.current = activeTurnLayoutLive;
      setKeepSettledActiveTurnLayout(false);
      return;
    }

    const shouldStartGrace = shouldStartActiveTurnLayoutGrace({
      previousTurnLayoutLive: previousActiveTurnLayoutLiveRef.current,
      currentTurnLayoutLive: activeTurnLayoutLive,
      latestTurnStartedAt: activeLatestTurn?.startedAt ?? null,
    });
    previousActiveTurnLayoutLiveRef.current = activeTurnLayoutLive;

    if (activeTurnLayoutLive) {
      setKeepSettledActiveTurnLayout(false);
      return;
    }

    if (!shouldStartGrace) {
      return;
    }

    setKeepSettledActiveTurnLayout(true);
    const timeoutId = window.setTimeout(() => {
      setKeepSettledActiveTurnLayout(false);
    }, ACTIVE_TURN_LAYOUT_SETTLE_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    setKeepSettledActiveTurnLayout,
    previousActiveTurnLayoutLiveRef,
    previousActiveTurnLayoutKeyRef,
    activeLatestTurn?.startedAt,
    activeTurnLayoutKey,
    activeTurnLayoutLive,
  ]);

  const { timelineMessages, optimisticUserMessages, setOptimisticUserMessages } =
    useChatTimelineMessages({
      threadId,
      activeThread,
      pendingAutomationConversation,
    });
  const promptHistory = useMemo(() => {
    const activeMessages = activeThread?.messages ?? EMPTY_MESSAGES;
    // Optimistic messages exist only briefly after a send; skip the full-transcript
    // id Set on the common (streaming-flush) path where there is nothing to reconcile.
    if (optimisticUserMessages.length === 0) {
      return derivePromptHistoryFromMessages(activeMessages);
    }
    const activeMessageIds = new Set(activeMessages.map((message) => message.id));
    const pendingOptimisticMessages = optimisticUserMessages.filter(
      (message) => !activeMessageIds.has(message.id),
    );
    return derivePromptHistoryFromMessages([...activeMessages, ...pendingOptimisticMessages]);
  }, [activeThread?.messages, optimisticUserMessages]);
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(
        timelineMessages,
        activeThread?.proposedPlans ?? [],
        agentActivityTimelineState.timelineWorkEntries,
      ),
    [activeThread?.proposedPlans, agentActivityTimelineState.timelineWorkEntries, timelineMessages],
  );
  const enteringUserMessageIds = useMemo<ReadonlySet<MessageId>>(
    () => new Set(optimisticUserMessages.map((message) => message.id)),
    [optimisticUserMessages],
  );
  // The user message a local send anchored at the top of the transcript viewport.
  // Set at the send sites and kept after the turn settles — collapsing the tail
  // spacer when a turn ends would visibly yank the settled transcript. The next
  // send replaces it, and thread switches reset it via the per-thread timeline
  // remount plus the threadId guard at the render site.
  const [tailAnchor, setTailAnchor] = useState<{
    threadId: ThreadId;
    messageId: MessageId;
  } | null>(null);
  // True from send until the tail-anchor hook finishes sliding the sent message
  // to the viewport top. The auto-follow effect stays quiet while set so the
  // anchored slide has exactly one scroll owner (see useTailAnchorScroll).

  // --- Pinned messages & notes (per-thread, server-synced through sidepanel commands) ---
  const pinnedMessages = activeThread?.pinnedMessages ?? EMPTY_PINNED_MESSAGES;
  const threadMarkers = activeThread?.threadMarkers ?? EMPTY_THREAD_MARKERS;
  const goalAchievements = activeThread?.goalAchievements ?? EMPTY_GOAL_ACHIEVEMENTS;
  const threadNotes = activeThread?.notes ?? "";
  const pinnedMessageIds = useMemo(
    () => new Set(pinnedMessages.map((pin) => pin.messageId)),
    [pinnedMessages],
  );
  const markerMessageIds = useMemo(
    () => new Set(threadMarkers.map((marker) => marker.messageId)),
    [threadMarkers],
  );
  // Resolve live text for the Environment panel in one transcript pass.
  const { markerMessageTextById, pinnedMessageTextById } = useMemo(() => {
    const needsPinnedText = pinnedMessageIds.size > 0;
    const needsMarkerText = markerMessageIds.size > 0;
    if (!needsPinnedText && !needsMarkerText) {
      return {
        pinnedMessageTextById: EMPTY_PINNED_TEXT,
        markerMessageTextById: EMPTY_PINNED_TEXT,
      };
    }
    const pinnedTextById = new Map<MessageId, string>();
    const markerTextById = new Map<MessageId, string>();
    for (const message of timelineMessages) {
      if (needsPinnedText && pinnedMessageIds.has(message.id)) {
        pinnedTextById.set(message.id, message.text);
      }
      if (needsMarkerText && markerMessageIds.has(message.id)) {
        markerTextById.set(message.id, message.text);
      }
    }
    return {
      pinnedMessageTextById: needsPinnedText ? pinnedTextById : EMPTY_PINNED_TEXT,
      markerMessageTextById: needsMarkerText ? markerTextById : EMPTY_PINNED_TEXT,
    };
  }, [markerMessageIds, pinnedMessageIds, timelineMessages]);
  const {
    handleTogglePinMessage,
    handleTogglePinnedMessageDone,
    handleUnpinMessage,
    handleRenamePinnedMessage,
    handleNotesChange,
  } = usePinnedMessageActions({ activeThreadId, pinnedMessages });
  const handleTogglePinMessageGuarded = useCallback(
    (messageId: MessageId) => {
      // Never pin an ephemeral automation-setup bubble; its id vanishes when setup ends.
      if (isPendingSetupBubbleId(messageId)) {
        return;
      }
      handleTogglePinMessage(messageId);
    },
    [handleTogglePinMessage, isPendingSetupBubbleId],
  );
  // Stable identity: this is forwarded to the memoized MessagesTimeline, so an inline
  // arrow here would defeat its `memo()` and re-derive every row on every keystroke.
  const canPinMessage = useCallback(
    (messageId: MessageId) => !isPendingSetupBubbleId(messageId),
    [isPendingSetupBubbleId],
  );
  const handleCopyProjectInstructionsToNotes = useCallback(() => {
    if (!activeThreadId) {
      return;
    }
    const nextNotes = mergeProjectInstructionsIntoThreadNotes({
      threadNotes,
      projectInstructions,
    });
    if (nextNotes === threadNotes) {
      return;
    }
    void handleNotesChange(activeThreadId, nextNotes)
      .then(() => {
        toastManager.add({
          type: "success",
          title: "Project instructions added to notepad.",
        });
      })
      .catch(() => {
        // `handleNotesChange` already surfaces the save failure through the shared notes toast.
      });
  }, [activeThreadId, handleNotesChange, projectInstructions, threadNotes]);
  const handleJumpToPinnedMessage = useCallback((messageId: MessageId) => {
    timelineControllerRef.current?.scrollToMessage(messageId);
  }, []);
  const handleJumpToThreadMarker = useCallback((marker: ThreadMarker) => {
    timelineControllerRef.current?.scrollToMarker(marker);
  }, []);
  const handleRemoveThreadMarker = useCallback(
    (markerId: ThreadMarkerId) => {
      if (!activeThreadId) {
        return;
      }
      void dispatchThreadMarkerRemove(activeThreadId, markerId).catch((error) => {
        console.error("Failed to remove thread marker", error);
        toastManager.add({
          type: "error",
          title: "Could not remove marker.",
        });
      });
    },
    [activeThreadId],
  );
  const handleToggleThreadMarkerDone = useCallback(
    (markerId: ThreadMarkerId) => {
      if (!activeThreadId) {
        return;
      }
      const marker = threadMarkers.find((candidate) => candidate.id === markerId);
      if (!marker) {
        return;
      }
      void dispatchThreadMarkerDoneSet(activeThreadId, markerId, !marker.done).catch((error) => {
        console.error("Failed to update thread marker", error);
        toastManager.add({
          type: "error",
          title: "Could not update marker.",
        });
      });
    },
    [activeThreadId, threadMarkers],
  );
  const handleRenameThreadMarker = useCallback(
    (markerId: ThreadMarkerId, label: string | null) => {
      if (!activeThreadId) {
        return;
      }
      void dispatchThreadMarkerLabelSet(activeThreadId, markerId, label).catch((error) => {
        console.error("Failed to rename thread marker", error);
        toastManager.add({
          type: "error",
          title: "Could not rename marker.",
        });
      });
    },
    [activeThreadId],
  );
  // Before treating an empty timeline as a genuinely new thread, wait for the
  // detail snapshot: a server thread whose history has not synced yet must show
  // a loading (or failed) transcript state instead of the empty landing.
  const threadDetailHydration = resolveThreadDetailHydration({
    isServerThread,
    hasTimelineEntries: timelineEntries.length > 0,
    detailSyncState: threadDetailSyncState,
  });
  const handleRetryThreadDetailSync = useCallback(() => {
    useStore.getState().clearThreadDetailSyncFailure(threadId);
    const api = readNativeApi();
    void api?.orchestration
      .subscribeThread(buildThreadSubscribeInput(threadId))
      .catch(() => undefined);
  }, [threadId]);
  // Stable identity: this element is forwarded to the memoized MessagesTimeline, so
  // building it inline in JSX would defeat its `memo()` on every keystroke.
  const transcriptEmptyStateContent = useMemo((): ReactNode => {
    if (isEditorRail) {
      return <span aria-hidden="true" />;
    }
    if (threadDetailHydration !== "ready") {
      return (
        <ThreadDetailHydrationState
          onRetry={handleRetryThreadDetailSync}
          state={threadDetailHydration}
        />
      );
    }
    return undefined;
  }, [handleRetryThreadDetailSync, isEditorRail, threadDetailHydration]);
  // Empty top-level threads render the centered landing composer instead of the transcript pane.
  // Home-scoped chats get the global "What should we work on?" copy plus the project picker,
  // while project-scoped drafts reuse the same centered layout with folder-specific copy.
  const isCenteredEmptyLanding =
    timelineEntries.length === 0 &&
    !activeThread?.parentThreadId &&
    !isEditorRail &&
    threadDetailHydration === "ready";
  const isEmptyChatLanding =
    isCenteredEmptyLanding && Boolean(homeDir) && isContainerLandingProject;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const turnDiffSummaryByAssistantMessageId = useMemo(() => {
    const messagesForDiffAnchoring: {
      id: MessageId;
      role: "user" | "assistant" | "system";
      turnId: TurnId | null;
    }[] = [];
    for (const message of timelineMessages) {
      messagesForDiffAnchoring.push({
        id: message.id,
        role: message.role,
        turnId: message.turnId ?? null,
      });
    }
    return buildTurnDiffSummaryByAssistantMessageId({
      turnDiffSummaries: turnDiffSummaries.map((summary) => ({
        ...summary,
        checkpointTurnCount:
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId],
      })),
      messages: messagesForDiffAnchoring,
    });
  }, [inferredCheckpointTurnCountByTurnId, turnDiffSummaries, timelineMessages]);
  const revertTurnCountByUserMessageId = useMemo(() => {
    const byUserMessageId = new Map<MessageId, number>();
    for (let index = 0; index < timelineEntries.length; index += 1) {
      const entry = timelineEntries[index];
      if (!entry || entry.kind !== "message" || entry.message.role !== "user") {
        continue;
      }

      for (let nextIndex = index + 1; nextIndex < timelineEntries.length; nextIndex += 1) {
        const nextEntry = timelineEntries[nextIndex];
        if (!nextEntry || nextEntry.kind !== "message") {
          continue;
        }
        if (nextEntry.message.role === "user") {
          break;
        }
        const summary = turnDiffSummaryByAssistantMessageId.get(nextEntry.message.id);
        if (!summary) {
          continue;
        }
        const turnCount =
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId];
        if (typeof turnCount !== "number") {
          break;
        }
        byUserMessageId.set(entry.message.id, Math.max(0, turnCount - 1));
        break;
      }
    }

    return byUserMessageId;
  }, [inferredCheckpointTurnCountByTurnId, timelineEntries, turnDiffSummaryByAssistantMessageId]);

  const threadWorkspaceCwd = activeProject
    ? resolveSharedThreadWorkspaceCwd({
        projectCwd: activeProject.cwd,
        envMode: resolvedThreadEnvMode,
        worktreePath: resolvedThreadWorktreePath,
        workingDirectory: resolvedThreadWorkingDirectory,
      })
    : null;
  const threadArtifactWorkspaceRoot = resolveThreadArtifactWorkspaceRoot({
    isStudioContainer,
    projectCwd: activeProject?.cwd ?? null,
    threadWorkspaceCwd,
  });
  const gitCwd = threadWorkspaceCwd;
  const gitBranchSourceCwd = isStudioContainer
    ? threadWorkspaceCwd
    : activeProject
      ? resolveThreadBranchSourceCwd({
          projectCwd: activeProject.cwd,
          worktreePath: resolvedThreadWorktreePath,
        })
      : null;

  const branchesQuery = useQuery(gitBranchesQueryOptions(gitBranchSourceCwd));
  const gitStatusQuery = useQuery(gitStatusQueryOptions(gitBranchSourceCwd));
  const localFolderBrowseRootPath = getLocalFolderBrowseRootPath(
    serverConfigQuery.data?.homeDir ?? null,
    isMacNavigatorPlatform(),
  );
  const {
    mentionTriggerQuery,
    isLocalFolderBrowserOpen,
    providerPlugins,
    providerNativeCommands,
    providerSkills,
    workspaceEntries,
    effectiveComposerTrigger,
    effectiveComposerTriggerKind,
    supportsTextNativeReviewCommand,
    isComposerMenuLoading,
    canCompactThread,
  } = useComposerDiscovery({
    threadId,
    selectedProvider,
    composerTrigger,
    composerCommandPicker,
    providerModelDiscoveryCwd,
    providerOptionsForDispatch,
    gitCwd,
    piAgentDir: settings.piAgentDir,
  });
  const activeRootBranch = useMemo(
    () =>
      resolveComposerSlashRootBranch({
        branches: branchesQuery.data?.branches,
        activeProjectCwd: activeProject?.cwd,
        activeThreadBranch: activeThread?.branch,
      }),
    [activeProject?.cwd, activeThread?.branch, branchesQuery.data?.branches],
  );
  const currentActiveGitBranch = useMemo(() => {
    if (gitStatusQuery.data !== undefined) {
      return gitStatusQuery.data.branch;
    }

    return (
      branchesQuery.data?.branches.find(
        (branch) =>
          branch.current === true &&
          (branch.worktreePath === null ||
            branch.worktreePath === undefined ||
            branch.worktreePath === activeProject?.cwd),
      )?.name ?? null
    );
  }, [activeProject?.cwd, branchesQuery.data?.branches, gitStatusQuery.data]);
  const settledThreadBranchMismatch = resolveSettledThreadBranchMismatch({
    isSettled:
      activeThread?.settledAt != null &&
      settledThreadBranchWarningDismissedThreadId !== activeThread.id,
    isLocalWorkspace: !isStudioContainer && resolvedThreadWorktreePath === null,
    threadBranch: settledThreadBranchAtActivation,
    currentBranch: currentActiveGitBranch,
  });

  const selectedModelCaps = useMemo(
    () => getModelCapabilities(selectedProvider, selectedModel),
    [selectedModel, selectedProvider],
  );
  const supportsFastSlashCommand = selectedModelCaps.supportsFastMode;
  const currentProviderModelOptions = composerModelOptions?.[selectedProvider];
  const fastModeEnabled =
    supportsFastSlashCommand &&
    (currentProviderModelOptions as { fastMode?: boolean } | undefined)?.fastMode === true;
  const composerPromptWithoutActiveSlashTrigger =
    composerTrigger?.kind === "slash-command"
      ? stripComposerTriggerText(prompt, composerTrigger)
      : prompt;
  const canOfferReviewCommand =
    (branchesQuery.data?.isRepo ?? true) &&
    canOfferReviewSlashCommand({
      prompt: composerPromptWithoutActiveSlashTrigger,
      imageCount: composerImages.length,
      terminalContextCount: composerTerminalContexts.length,
      selectedSkillCount: selectedComposerSkills.length,
      selectedMentionCount: selectedComposerMentions.length,
    });
  const canOfferForkCommand =
    isServerThread &&
    activeThread !== undefined &&
    canOfferForkSlashCommand({
      prompt: composerPromptWithoutActiveSlashTrigger,
      imageCount: composerImages.length,
      terminalContextCount: composerTerminalContexts.length,
      selectedSkillCount: selectedComposerSkills.length,
      selectedMentionCount: selectedComposerMentions.length,
      interactionMode,
    });
  const canOfferSideCommand =
    isServerThread &&
    activeThread !== undefined &&
    canOfferSideSlashCommand({
      prompt: composerPromptWithoutActiveSlashTrigger,
      imageCount: composerImages.length,
      terminalContextCount: composerTerminalContexts.length,
      selectedSkillCount: selectedComposerSkills.length,
      selectedMentionCount: selectedComposerMentions.length,
      interactionMode,
      isSidechat: Boolean(activeThread.sidechatSourceThreadId),
    });
  // Export is hidden while the thread is running so archives cannot capture a
  // partial assistant response. Same shared predicate as the server's 409
  // guard, so the composer and the export route cannot drift.
  const canOfferExportCommand =
    isServerThread &&
    activeThread !== undefined &&
    threadExportBlockedReason(activeThread) === null;
  const normalComposerMenuItems = useComposerCommandMenuItems({
    composerTrigger: effectiveComposerTrigger,
    provider: selectedProvider,
    providerPlugins,
    providerNativeCommands,
    providerSkills,
    workspaceEntries,
    searchableModelOptions,
    supportsFastSlashCommand,
    canOfferCompactCommand:
      canCompactThread &&
      isServerThread &&
      activeThread?.session !== null &&
      activeThread?.session?.status !== "closed",
    canOfferReviewCommand,
    canOfferForkCommand,
    canOfferSideCommand,
    canOfferExportCommand,
    dynamicAgents,
    threadMentionSources: {
      threads: composerThreadSummaries,
      projects: composerThreadProjects,
      currentThreadId: threadId,
    },
  });
  const composerMenuItems = useMemo(() => {
    if (composerCommandPicker === "fork-target") {
      return [
        {
          id: "fork-target:worktree",
          type: "fork-target" as const,
          target: "worktree" as const,
          label: "Fork Into New Worktree",
          description: "Continue in a new worktree",
        },
        {
          id: "fork-target:local",
          type: "fork-target" as const,
          target: "local" as const,
          label: "Fork Into Local",
          description:
            activeThread?.worktreePath || activeThread?.envMode === "worktree"
              ? "Continue in this local worktree"
              : "Continue in the current local thread",
        },
      ];
    }
    if (composerCommandPicker === "review-target") {
      return [
        {
          id: "review-target:changes",
          type: "review-target" as const,
          target: "changes" as const,
          label: "Review Uncommitted Changes",
          description: "Review local uncommitted changes",
        },
        {
          id: "review-target:base-branch",
          type: "review-target" as const,
          target: "base-branch" as const,
          label: "Review Against Base Branch",
          description: "Review the current branch diff against its base",
        },
      ];
    }

    return normalComposerMenuItems;
  }, [
    activeThread?.envMode,
    activeThread?.worktreePath,
    composerCommandPicker,
    normalComposerMenuItems,
  ]);
  const composerMenuOpen = Boolean(composerTrigger || composerCommandPicker);
  const activeComposerMenuItem = useMemo(
    () =>
      composerMenuItems.find((item) => item.id === composerHighlightedItemId) ??
      composerMenuItems[0] ??
      null,
    [composerHighlightedItemId, composerMenuItems],
  );
  // Keydown can fire as soon as the updated menu commits, before passive effects.
  useLayoutEffect(() => {
    composerMenuOpenRef.current = composerMenuOpen;
    composerMenuItemsRef.current = composerMenuItems;
    activeComposerMenuItemRef.current = activeComposerMenuItem;
  }, [
    composerMenuOpenRef,
    composerMenuItemsRef,
    activeComposerMenuItemRef,
    composerMenuOpen,
    composerMenuItems,
    activeComposerMenuItem,
  ]);
  const nonPersistedComposerImageIdSet = useMemo(() => {
    const durableBlobIds = new Set(
      durablyPersistedComposerImageIds
        .filter((attachment) => Boolean(attachment.blobKey))
        .map((attachment) => attachment.id),
    );
    return new Set(nonPersistedComposerImageIds.filter((id) => !durableBlobIds.has(id)));
  }, [durablyPersistedComposerImageIds, nonPersistedComposerImageIds]);
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const availableEditors = serverConfigQuery.data?.availableEditors ?? EMPTY_AVAILABLE_EDITORS;
  const { rememberCustomBinaryPathForDispatch, providerStatuses } = useChatProviderStatus({
    activeThread,
    settings,
    configuredProviderStatuses: serverConfigQuery.data?.providers,
  });
  const handoffBadgeLabel = useMemo(
    () => (activeThread ? resolveThreadHandoffBadgeLabel(activeThread) : null),
    [activeThread],
  );
  const handoffBadgeSourceProvider = activeThread?.handoff?.sourceProvider ?? null;
  const handoffBadgeTargetProvider = activeThread?.handoff
    ? activeThread.modelSelection.provider
    : null;
  const handoffTargetProviders = useMemo(
    () =>
      activeThread
        ? resolveAvailableHandoffTargetProviders({
            sourceProvider: activeThread.modelSelection.provider,
            providerSettings: serverSettingsQuery.data?.providers,
            providerStatuses,
          })
        : [],
    [activeThread, providerStatuses, serverSettingsQuery.data?.providers],
  );
  const handoffActionLabel = activeThread ? "Hand off thread" : "Create handoff thread";
  const activeProviderStatus = useMemo(
    () => findProviderStatus(providerStatuses, selectedProvider),
    [selectedProvider, providerStatuses],
  );
  const activeProviderHealthBannerDismissalKey = useMemo(
    () => getProviderHealthBannerDismissalKey(activeProviderStatus),
    [activeProviderStatus],
  );
  const visibleActiveProviderStatus =
    activeProviderHealthBannerDismissalKey &&
    dismissedProviderHealthBannerKeys.includes(activeProviderHealthBannerDismissalKey)
      ? null
      : activeProviderStatus;
  const voiceProviderStatus = useMemo(
    () => findProviderStatus(providerStatuses, "codex"),
    [providerStatuses],
  );
  const refreshProviderStatuses = useRefreshProviderStatusesNow();
  const activeProjectCwd = activeProject?.cwd ?? null;
  const activeThreadWorktreePath = isStudioContainer ? null : (activeThread?.worktreePath ?? null);
  const hasNativeUserMessages = useMemo(
    () =>
      activeThread?.messages.some(
        (message) => message.role === "user" && message.source === "native",
      ) ?? false,
    [activeThread?.messages],
  );
  // Left to React Compiler instead of a manual `useMemo`: the hand-written dep array could
  // not be preserved (the compiler cannot prove `threadWorkspaceCwd` is never mutated), which
  // bailed the whole component out of compilation. The empty case returns a module-level
  // constant so its identity is stable no matter how the value is memoized.
  const terminalRuntimeProjectCwd = isStudioContainer ? threadWorkspaceCwd : activeProjectCwd;
  const threadTerminalRuntimeEnv = terminalRuntimeProjectCwd
    ? projectScriptRuntimeEnv({
        project: {
          cwd: terminalRuntimeProjectCwd,
        },
        worktreePath: activeThreadWorktreePath,
      })
    : EMPTY_TERMINAL_RUNTIME_ENV;
  const isGitRepo = resolveGitRepoUiState({
    isStudioContainer,
    queriedIsRepo: branchesQuery.data?.isRepo,
  });
  // Studio never offers "Initialize Git": its reference folder is ordinary cwd context,
  // so Git actions appear only when that selected folder is already a repository.
  const showGitActions = isStudioContainer
    ? Boolean(resolvedThreadWorkingDirectory) && isGitRepo
    : !isContainerLandingProject || Boolean(resolvedThreadWorktreePath);
  const repoDiffTotals = useRepoDiffTotals({
    gitCwd: threadWorkspaceCwd,
    isGitRepo,
    refetchInterval: repoDiffBadgeRefreshIntervalMs,
  });
  // The composer live strip is turn-scoped; repoDiffTotals can include unrelated
  // local edits that existed before the active agent turn started.
  const activeTurnLiveDiffState = useMemo(
    () =>
      resolveActiveTurnLiveDiffState({
        latestTurnId: activeLatestTurn?.turnId ?? null,
        turnDiffSummaries,
        workLogEntries,
      }),
    [activeLatestTurn?.turnId, turnDiffSummaries, workLogEntries],
  );
  const splitTerminalShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "terminal.splitRight") ??
      shortcutLabelForCommand(keybindings, "terminal.split"),
    [keybindings],
  );
  const splitTerminalDownShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.splitDown"),
    [keybindings],
  );
  const newTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.new"),
    [keybindings],
  );
  const closeTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.close"),
    [keybindings],
  );
  const closeWorkspaceShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.workspace.closeActive"),
    [keybindings],
  );
  const diffPanelShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "diff.toggle"),
    [keybindings],
  );
  const chatSplitShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "chat.split"),
    [keybindings],
  );
  const modelPickerShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "modelPicker.toggle") ??
      formatShortcutLabel({
        key: "m",
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        modKey: true,
      }),
    [keybindings],
  );
  const traitsPickerShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "traitsPicker.toggle"),
    [keybindings],
  );
  const onToggleDiff = useCallback(() => {
    if (diffEnvironmentPending && !diffOpen) {
      return;
    }
    if (onToggleDiffPanel) {
      onToggleDiffPanel();
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return diffOpen
          ? { ...rest, panel: undefined, diff: undefined }
          : { ...rest, panel: "diff", diff: "1" };
      },
    });
  }, [diffEnvironmentPending, diffOpen, navigate, onToggleDiffPanel, threadId]);
  const onToggleBrowser = useCallback(() => {
    if (onToggleBrowserPanel) {
      onToggleBrowserPanel();
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return browserOpen ? { ...rest, panel: undefined } : { ...rest, panel: "browser" };
      },
    });
  }, [browserOpen, navigate, onToggleBrowserPanel, threadId]);
  const openBrowserUrl = useCallback(
    (url: string) => {
      const api = readNativeApi();
      void api?.browser.open({ threadId, initialUrl: url }).catch((error) => {
        toastManager.add({
          type: "error",
          title: "Could not open repository",
          description:
            error instanceof Error ? error.message : "The in-app browser could not open GitHub.",
        });
      });
      if (onOpenBrowserUrl) {
        onOpenBrowserUrl(url);
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          panel: "browser",
        }),
      });
    },
    [navigate, onOpenBrowserUrl, threadId],
  );

  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "closed")),
  );
  const isTerminalPrimarySurface = terminalState.entryPoint === "terminal";
  const isTerminalEnvironmentContext =
    isTerminalPrimarySurface || terminalWorkspaceTerminalTabActive;
  const shouldShowProviderHealthBanner = shouldRenderProviderHealthBanner({
    threadEntryPoint: terminalState.entryPoint,
    terminalWorkspaceTerminalTabActive,
  });
  // Terminal-only threads should not pay to mount the hidden chat/composer pane.
  const shouldRenderChatPaneContent = !(
    terminalWorkspaceTerminalTabActive && terminalState.workspaceLayout === "terminal-only"
  );
  const secondaryChromeThreadId = activeThread?.id ?? threadId;
  const shouldDeferSecondaryChrome =
    activeThread !== undefined && !isCenteredEmptyLanding && !terminalWorkspaceTerminalTabActive;
  const [secondaryChromeState, setSecondaryChromeState] = useState(() => ({
    threadId: secondaryChromeThreadId,
    ready: true,
  }));
  const secondaryChromeReady =
    !shouldDeferSecondaryChrome ||
    (secondaryChromeState.threadId === secondaryChromeThreadId && secondaryChromeState.ready);

  useEffect(() => {
    if (!shouldDeferSecondaryChrome) {
      setSecondaryChromeState((current) =>
        current.threadId === secondaryChromeThreadId && current.ready
          ? current
          : { threadId: secondaryChromeThreadId, ready: true },
      );
      return;
    }

    setSecondaryChromeState({
      threadId: secondaryChromeThreadId,
      ready: false,
    });
    const frame = window.requestAnimationFrame(() => {
      setSecondaryChromeState({
        threadId: secondaryChromeThreadId,
        ready: true,
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [setSecondaryChromeState, secondaryChromeThreadId, shouldDeferSecondaryChrome]);
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      if (getThreadFromState(useStore.getState(), targetThreadId)) {
        setStoreThreadError(targetThreadId, error);
        return;
      }
      setLocalDraftErrorsByThreadId((existing) => {
        if ((existing[targetThreadId] ?? null) === error) {
          return existing;
        }
        return {
          ...existing,
          [targetThreadId]: error,
        };
      });
    },
    [setLocalDraftErrorsByThreadId, setStoreThreadError],
  );
  const composerImageAttachmentCount = useCallback(
    () =>
      effectiveComposerAttachmentCount(useComposerDraftStore.getState().draftsByThreadId[threadId]),
    [threadId],
  );
  const commitPreparedComposerImages = useCallback(
    (images: ComposerImageAttachment[]) => addComposerImagesToDraft(images),
    [addComposerImagesToDraft],
  );
  const setComposerImagePreparationError = useCallback(
    (error: string | null) => setThreadError(threadId, error),
    [setThreadError, threadId],
  );
  const {
    addImages: enqueueComposerImages,
    isPreparingImages: isPreparingComposerImages,
    pendingImageCount: pendingComposerImageCount,
    waitForPending: waitForPendingComposerImages,
  } = useComposerImageIntake({
    threadId,
    existingAttachmentCount: composerImageAttachmentCount,
    commitImages: commitPreparedComposerImages,
    onError: setComposerImagePreparationError,
  });

  const focusComposer = useCallback(() => {
    // Secondary chrome is deferred during thread switches; replay focus once it
    // mounts. A disabled editor (dispatch connecting, pending approval) cannot
    // take focus either, so keep the request pending until it re-enables.
    const editor = composerEditorRef.current;
    if (!secondaryChromeReady || !editor || isComposerEditorDisabled) {
      pendingComposerFocusRef.current = true;
      return;
    }
    pendingComposerFocusRef.current = false;
    editor.focusAtEnd();
  }, [composerEditorRef, pendingComposerFocusRef, secondaryChromeReady, isComposerEditorDisabled]);
  const toggleComposerFocus = useCallback(() => {
    const editor = composerEditorRef.current;
    if (secondaryChromeReady && editor?.isFocused()) {
      pendingComposerFocusRef.current = false;
      editor.blur();
      return;
    }
    focusComposer();
  }, [composerEditorRef, pendingComposerFocusRef, focusComposer, secondaryChromeReady]);
  const scheduleComposerFocus = useCallback(() => {
    pendingComposerFocusRef.current = true;
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [pendingComposerFocusRef, focusComposer]);
  // External panels (diff headers, file explorer, preview) bump this nonce after
  // inserting a reference so the composer visibly receives the text.
  const composerFocusRequestNonce = useComposerFocusRequestStore(
    (store) => store.requestsByThreadId[threadId] ?? 0,
  );
  useEffect(() => {
    if (composerFocusRequestNonce > 0) {
      scheduleComposerFocus();
    }
  }, [composerFocusRequestNonce, scheduleComposerFocus]);
  useEffect(() => {
    if (!secondaryChromeReady || !pendingComposerFocusRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pendingComposerFocusRef, focusComposer, secondaryChromeReady, secondaryChromeThreadId]);
  // Keep the two composer picker menus mutually exclusive so shortcuts always open one surface.
  const handleModelPickerOpenChange = useCallback(
    (open: boolean) => {
      setIsModelPickerOpen(open);
      if (open) {
        setIsTraitsPickerOpen(false);
      }
    },
    [setIsModelPickerOpen, setIsTraitsPickerOpen],
  );
  const handleTraitsPickerOpenChange = useCallback(
    (open: boolean) => {
      setIsTraitsPickerOpen(open);
      if (open) {
        setIsModelPickerOpen(false);
      }
    },
    [setIsModelPickerOpen, setIsTraitsPickerOpen],
  );
  const appendVoiceTranscriptToComposer = useCallback(
    (transcript: string) => {
      const nextPrompt = appendVoiceTranscriptToPrompt(promptRef.current, transcript);
      if (!nextPrompt) {
        return;
      }

      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      scheduleComposerFocus();
    },
    [promptRef, setComposerCursor, setComposerTrigger, scheduleComposerFocus, setPrompt],
  );
  const {
    isVoiceRecording,
    isVoiceTranscribing,
    voiceWaveformLevels,
    voiceRecordingDurationLabel,
    showVoiceNotesControl,
    startComposerVoiceRecording,
    submitComposerVoiceRecording,
    cancelComposerVoiceRecording,
  } = useComposerVoiceController({
    activeProject,
    activeThreadId: activeThread?.id ?? null,
    threadId,
    selectedProvider,
    activeProviderStatus: voiceProviderStatus,
    pendingUserInputCount: pendingUserInputs.length,
    onTranscriptReady: appendVoiceTranscriptToComposer,
    refreshVoiceStatus: refreshProviderStatuses,
    actionArmDelayMs: VOICE_RECORDER_ACTION_ARM_DELAY_MS,
    failureCopy: {
      transcriptionFailedTitle: "Couldn't transcribe voice note",
    },
    onGuardWarning: warnVoiceGuard,
  });
  const addTerminalContextToDraft = useCallback(
    (selection: TerminalContextSelection) => {
      if (!activeThreadId) {
        return;
      }
      discardPromptHistoryNavigationForComposerMutation();
      const snapshot = composerEditorRef.current?.readSnapshot() ?? {
        value: promptRef.current,
        cursor: composerCursor,
        expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
        selectionCollapsed: true,
        terminalContextIds: composerTerminalContexts.map((context) => context.id),
      };
      const insertion = insertInlineTerminalContextPlaceholder(
        snapshot.value,
        snapshot.expandedCursor,
      );
      const nextCollapsedCursor = collapseExpandedComposerCursor(
        insertion.prompt,
        insertion.cursor,
      );
      const inserted = insertComposerDraftTerminalContext(
        activeThreadId,
        insertion.prompt,
        {
          id: randomUUID(),
          threadId: activeThreadId,
          createdAt: new Date().toISOString(),
          ...selection,
        },
        insertion.contextIndex,
      );
      if (!inserted) {
        return;
      }
      promptRef.current = insertion.prompt;
      setComposerCursor(nextCollapsedCursor);
      setComposerTrigger(detectComposerTrigger(insertion.prompt, insertion.cursor));
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAt(nextCollapsedCursor);
      });
    },
    [
      promptRef,
      setComposerCursor,
      setComposerTrigger,
      composerEditorRef,
      activeThreadId,
      composerCursor,
      composerTerminalContexts,
      discardPromptHistoryNavigationForComposerMutation,
      insertComposerDraftTerminalContext,
    ],
  );
  // Terminal-only workspaces intentionally have no mounted composer. Do not
  // publish a global-looking action with nowhere to insert the selection.
  const canAddTerminalContextToChat = activeThread !== undefined && shouldRenderChatPaneContent;
  // Keep the published capability stable while cursor and draft state change;
  // dock terminals should not rerender for ordinary composer edits.
  const addTerminalContextToDraftRef = useRef(addTerminalContextToDraft);
  useLayoutEffect(() => {
    addTerminalContextToDraftRef.current = addTerminalContextToDraft;
  }, [addTerminalContextToDraftRef, addTerminalContextToDraft]);
  const addRegisteredTerminalContextToDraft = useCallback(
    (selection: TerminalContextSelection) => {
      addTerminalContextToDraftRef.current(selection);
    },
    [addTerminalContextToDraftRef],
  );
  useLayoutEffect(() => {
    if (!canAddTerminalContextToChat) {
      return;
    }
    return registerTerminalContextComposerTarget(paneScopeId, addRegisteredTerminalContextToDraft);
  }, [addRegisteredTerminalContextToDraft, canAddTerminalContextToChat, paneScopeId]);
  // Collapse an oversized paste into an attachment card above the composer instead
  // of flooding the editor with raw text. The card holds the full content until the
  // user sends or clicks "Show in text field".
  const addPastedTextToDraft = useCallback(
    (text: string) => {
      if (!activeThread) {
        return;
      }
      discardPromptHistoryNavigationForComposerMutation();
      addComposerDraftPastedTexts(activeThread.id, [
        createPastedTextDraft({
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          text,
        }),
      ]);
    },
    [activeThread, addComposerDraftPastedTexts, discardPromptHistoryNavigationForComposerMutation],
  );
  // The terminal's panel toggle mirrors the right dock's collapse control: it shows
  // or hides the side panel only when this thread already has a pane to show.
  const rightDockOpen = useRightDockStore((store) => selectRightDockState(threadId)(store).open);
  const isMobileViewport = useIsMobile();
  // Temporary threads are visually identical to regular chats — they use the same
  // Environment panel + header controls. "Temporary" is purely a sidebar badge +
  // auto-delete-on-leave concern, never a stripped-down chat UI.
  const environmentEnabled = !isEditorRail;
  const environmentUsesFloatingOverlay =
    isTerminalEnvironmentContext || isMobileViewport || rightDockOpen || surfaceMode === "split";
  const environmentDefaultOpen = resolveDefaultEnvironmentPanelOpen({
    environmentEnabled,
    isCenteredEmptyLanding,
    isTerminalPrimarySurface,
    isConstrainedChatLayout: environmentUsesFloatingOverlay,
    settingsDefaultOpen: settings.environmentPanelDefaultOpen,
  });
  // Every close (header toggle or panel action click) stores the cross-chat preference,
  // so a dismissed panel stays closed when switching threads until it is toggled back on.
  // The same toggle also persists to settings so the preference survives reloads.
  const [environmentPanelPreferenceOpen, setEnvironmentPanelPreferenceOpen] = useState<
    boolean | null
  >(null);
  const updateEnvironmentPanelPreference = useCallback(
    (open: boolean, persist: boolean) => {
      const update = resolveEnvironmentPanelPreferenceUpdate({ open, persist });
      setEnvironmentPanelPreferenceOpen(update.userPreferenceOpen);
      if (update.settingsDefaultOpen !== null) {
        updateSettings({ environmentPanelDefaultOpen: update.settingsDefaultOpen });
      }
    },
    // The state setter is stable, so listing it changes nothing at runtime — but React
    // Compiler infers it as a dependency here and refuses to compile the component when the
    // hand-written array omits it.
    [setEnvironmentPanelPreferenceOpen, updateSettings],
  );
  const setEnvironmentPanelOpenPreference = useCallback(
    (open: boolean) => updateEnvironmentPanelPreference(open, true),
    [updateEnvironmentPanelPreference],
  );
  const closeEnvironmentPanelAfterAction = useCallback(
    () => updateEnvironmentPanelPreference(false, false),
    [updateEnvironmentPanelPreference],
  );
  const environmentPanelOpen = resolveEnvironmentPanelOpen({
    defaultOpen: environmentDefaultOpen,
    userPreferenceOpen: environmentPanelPreferenceOpen,
  });
  const environmentPanelVisible = resolveEnvironmentPanelVisible({
    environmentEnabled,
    environmentPanelOpen,
  });
  const githubRepositoryQuery = useQuery(
    gitGithubRepositoryQueryOptions(gitBranchSourceCwd, environmentPanelVisible),
  );
  const threadRecap = useThreadRecap({
    thread: activeThread,
    cwd: threadWorkspaceCwd,
    enabled: environmentPanelVisible,
    latestTurnSettled,
    codexHomePath: settings.codexHomePath || null,
    providerOptions: providerOptionsForDispatch ?? null,
  });
  const hasRightDockPanes = useRightDockStore(
    (store) => selectRightDockState(threadId)(store).panes.length > 0,
  );
  const setRightDockOpen = useRightDockStore((store) => store.setDockOpen);
  const toggleRightDock = useCallback(() => {
    setRightDockOpen(threadId, !rightDockOpen);
  }, [rightDockOpen, setRightDockOpen, threadId]);
  const terminalDrawerProps = {
    threadId,
    onTogglePanel: hasRightDockPanes ? toggleRightDock : undefined,
    isPanelOpen: hasRightDockPanes ? rightDockOpen : undefined,
    cwd: gitCwd ?? activeProject?.cwd ?? "",
    runtimeEnv: threadTerminalRuntimeEnv,
    height: terminalState.terminalHeight,
    terminalIds: terminalState.terminalIds,
    terminalLabelsById: terminalState.terminalLabelsById,
    terminalTitleOverridesById: terminalState.terminalTitleOverridesById,
    terminalCliKindsById: terminalState.terminalCliKindsById,
    terminalAttentionStatesById: terminalState.terminalAttentionStatesById ?? {},
    runningTerminalIds: terminalState.runningTerminalIds,
    activeTerminalId: terminalState.activeTerminalId,
    terminalGroups: terminalState.terminalGroups,
    activeTerminalGroupId: terminalState.activeTerminalGroupId,
    focusRequestId: terminalFocusRequestId,
    onSplitTerminal: splitTerminalRight,
    onSplitTerminalDown: splitTerminalDown,
    onNewTerminal: createNewTerminal,
    onNewTerminalTab: createNewTerminalTab,
    onMoveTerminalToGroup: moveTerminalToNewGroup,
    splitShortcutLabel: splitTerminalShortcutLabel ?? undefined,
    splitDownShortcutLabel: splitTerminalDownShortcutLabel ?? undefined,
    newShortcutLabel: newTerminalShortcutLabel ?? undefined,
    closeShortcutLabel: closeTerminalShortcutLabel ?? undefined,
    workspaceCloseShortcutLabel: closeWorkspaceShortcutLabel ?? undefined,
    onActiveTerminalChange: activateTerminal,
    onCloseTerminal: closeTerminal,
    onTerminalSessionExited: handleTerminalSessionExited,
    onCloseTerminalGroup: (groupId: string) => {
      if (!activeThreadId) return;
      storeCloseTerminalGroup(activeThreadId, groupId);
    },
    onHeightChange: setTerminalHeight,
    onResizeTerminalSplit: (groupId: string, splitId: string, weights: number[]) => {
      if (!activeThreadId) return;
      storeResizeTerminalSplit(activeThreadId, groupId, splitId, weights);
    },
    onTerminalMetadataChange: (
      terminalId: string,
      metadata: {
        cliKind: "codex" | "claude" | "antigravity" | null;
        label: string;
      },
    ) => {
      if (!activeThreadId) return;
      storeSetTerminalMetadata(activeThreadId, terminalId, metadata);
    },
    onTerminalActivityChange: (
      terminalId: string,
      activity: {
        hasRunningSubprocess: boolean;
        agentState: "running" | "attention" | "review" | null;
      },
    ) => {
      if (!activeThreadId) return;
      storeSetTerminalActivity(activeThreadId, terminalId, activity);
    },
    ...(canAddTerminalContextToChat ? { onAddTerminalContext: addTerminalContextToDraft } : {}),
  };
  const {
    runProjectScript,
    saveProjectScript,
    updateProjectScript,
    deleteProjectScript,
    lastInvokedScriptByProjectId,
  } = useChatProjectScripts({
    activeThreadId,
    activeThread,
    activeProject,
    gitCwd,
    isStudioContainer,
    terminalState,
    requestTerminalFocus,
    setTerminalOpen,
    setThreadError,
  });
  const stopActiveThreadSession = useCallback(async () => {
    const api = readNativeApi();
    if (
      !api ||
      !isServerThread ||
      !activeThread ||
      activeThread.session === null ||
      activeThread.session.status === "closed"
    ) {
      return;
    }

    await api.orchestration.dispatchCommand({
      type: "thread.session.stop",
      commandId: newCommandId(),
      threadId: activeThread.id,
      createdAt: new Date().toISOString(),
    });
  }, [activeThread, isServerThread]);
  const {
    handoffBusy,
    worktreeHandoffDialogOpen,
    setWorktreeHandoffDialogOpen,
    worktreeHandoffName,
    setWorktreeHandoffName,
    onHandoffToWorktree,
    onHandoffToLocal,
    confirmWorktreeHandoff,
  } = useThreadWorkspaceHandoff({
    activeProject,
    activeThread,
    activeRootBranch,
    activeThreadAssociatedWorktree,
    isServerThread,
    stopActiveThreadSession,
    runProjectScript,
  });
  const {
    persistRuntimeModeChange,
    handleRuntimeModeChange,
    handleInteractionModeChange,
    toggleInteractionMode,
    resetInteractionMode,
    persistThreadSettingsForNextTurn,
  } = useChatRuntimeModes({
    threadId,
    activeThread,
    serverThread,
    isLocalDraftThread,
    runtimeMode,
    interactionMode,
    selectedProvider,
    selectedRuntimeModel,
    selectedModelSelection,
    activeProviderStatus,
    scheduleComposerFocus,
  });
  const togglePlanSidebar = useCallback(() => {
    setPlanSidebarOpen((open) => {
      if (open) {
        planSidebarDismissedForTurnRef.current =
          activeTaskList?.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
      } else {
        planSidebarDismissedForTurnRef.current = null;
      }
      return !open;
    });
  }, [
    setPlanSidebarOpen,
    planSidebarDismissedForTurnRef,
    activeTaskList?.turnId,
    sidebarProposedPlan?.turnId,
  ]);
  useLayoutEffect(() => {
    const shouldFollowPendingTurn =
      activeThread?.id !== undefined && autoFollowThreadIdRef.current === activeThread.id;
    if (isUserScrollDetachedRef.current || (!isAtEndRef.current && !shouldFollowPendingTurn)) {
      return;
    }
    // Re-apply the bottom stick only for real transcript messages; tool/work
    // rows can arrive quickly and should not churn scroll/layout work.
    const frameId = window.requestAnimationFrame(() => {
      // The tail-anchor slide owns the scroll after a send; a re-snap here
      // would hard-jump past the smooth slide mid-flight. Once the anchor
      // settles the spacer keeps the end position exact, so nothing is missed.
      if (tailAnchorScrollInFlightRef.current || isUserScrollDetachedRef.current) {
        return;
      }
      const shouldAnimate = animateNextAutoFollowScrollRef.current;
      animateNextAutoFollowScrollRef.current = false;
      scrollToEnd(shouldAnimate);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeThread?.id, scrollToEnd, transcriptAutoFollowSignal]);
  const {
    pendingTranscriptSelectionAction,
    commitTranscriptAssistantSelection,
    dismissTranscriptSelectionAction,
    onMessagesClickCapture,
    onMessagesMouseUp,
    onMessagesPointerCancel,
    onMessagesPointerDown,
    onMessagesPointerUp,
    onMessagesScroll,
    onMessagesTouchEnd,
    onMessagesTouchMove,
    onMessagesTouchStart,
    onMessagesWheel,
  } = useTranscriptAssistantSelectionAction({
    threadId,
    enabled:
      Boolean(activeThread) &&
      !isInactiveSplitPane &&
      pendingUserInputs.length === 0 &&
      !isComposerApprovalState,
    composerImagesRef,
    composerFilesRef,
    composerAssistantSelectionsRef,
    addComposerAssistantSelectionToDraft,
    canReferenceAssistantSelection: (selection) =>
      !isPendingSetupBubbleId(MessageId.makeUnsafe(selection.assistantMessageId)),
    scheduleComposerFocus,
    onMessagesClickCaptureBase,
    onMessagesPointerCancelBase,
    onMessagesPointerDownBase,
    onMessagesPointerUpBase,
    onMessagesScrollBase,
    onMessagesTouchEndBase,
    onMessagesTouchMoveBase,
    onMessagesTouchStartBase,
    onMessagesWheelBase,
  });
  const createMarkerFromPendingSelection = useCallback(
    (style: ThreadMarkerStyle, color: ThreadMarkerColor) => {
      const pendingSelection = pendingTranscriptSelectionAction;
      if (!pendingSelection || !activeThreadId) {
        return;
      }
      const messageId = MessageId.makeUnsafe(pendingSelection.selection.assistantMessageId);
      if (isPendingSetupBubbleId(messageId)) {
        // Don't mark an ephemeral automation-setup bubble; it disappears when setup ends.
        dismissTranscriptSelectionAction();
        window.getSelection()?.removeAllRanges();
        return;
      }
      const message = timelineMessages.find((candidate) => candidate.id === messageId);
      if (!message) {
        toastManager.add({
          type: "warning",
          title: "Could not find the selected message.",
        });
        return;
      }
      const range = resolveTranscriptMarkerRange({
        messageText: message.text,
        selectedText: pendingSelection.selection.text,
      });
      if (!range) {
        toastManager.add({
          type: "warning",
          title: "Select a unique phrase to mark it.",
          description: "Try including a few more words so Forkara can find the exact place.",
        });
        return;
      }
      dismissTranscriptSelectionAction();
      window.getSelection()?.removeAllRanges();
      const sameStyleOverlappingMarkers = threadMarkers.filter(
        (marker) =>
          marker.messageId === messageId &&
          marker.style === style &&
          marker.startOffset < range.endOffset &&
          range.startOffset < marker.endOffset,
      );
      if (sameStyleOverlappingMarkers.length > 0) {
        for (const marker of sameStyleOverlappingMarkers) {
          void dispatchThreadMarkerRemove(activeThreadId, marker.id).catch((error) => {
            console.error("Failed to remove thread marker", error);
            toastManager.add({
              type: "error",
              title: "Could not remove marker.",
            });
          });
        }
        return;
      }
      void dispatchThreadMarkerAdd({
        threadId: activeThreadId,
        markerId: ThreadMarkerId.makeUnsafe(crypto.randomUUID()),
        messageId,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        selectedText: message.text.slice(range.startOffset, range.endOffset),
        style,
        color,
      }).catch((error) => {
        console.error("Failed to create thread marker", error);
        toastManager.add({
          type: "error",
          title: "Could not create marker.",
        });
      });
    },
    [
      activeThreadId,
      dismissTranscriptSelectionAction,
      isPendingSetupBubbleId,
      pendingTranscriptSelectionAction,
      threadMarkers,
      timelineMessages,
    ],
  );
  const createHighlightFromPendingSelection = useCallback(() => {
    createMarkerFromPendingSelection("highlight", "yellow");
  }, [createMarkerFromPendingSelection]);
  const createUnderlineFromPendingSelection = useCallback(() => {
    createMarkerFromPendingSelection("underline", "blue");
  }, [createMarkerFromPendingSelection]);

  useLayoutEffect(() => {
    if (isInactiveSplitPane) return;
    const composerForm = composerFormRef.current;
    if (!composerForm) return;
    const measureComposerFormWidth = () => composerForm.clientWidth;
    const syncComposerFooterLayout = () => {
      const composerFormWidth = measureComposerFormWidth();
      const nextCompact = shouldUseCompactComposerFooter(composerFormWidth, {
        hasWideActions: composerFooterHasWideActions,
      });
      setIsComposerFooterCompact((previous) => (previous === nextCompact ? previous : nextCompact));
      // Tier the footer controls by MEASURED overflow: demote one step while
      // the footer row's content is wider than the row, promote back (with
      // hysteresis) when the recorded overflow width is comfortably exceeded.
      const footerRow = composerForm.querySelector<HTMLElement>("[data-chat-composer-footer]");
      if (footerRow) {
        const rowOverflows = footerRow.scrollWidth > footerRow.clientWidth + 1;
        // The leading cluster clips (overflow-hidden) in compact mode instead
        // of growing the row's scrollWidth, so check it directly — a clipped
        // "+"/access-rules cluster must also demote the tier.
        const leadingCluster = footerRow.querySelector<HTMLElement>("[data-chat-composer-leading]");
        const leadingClips =
          nextCompact &&
          leadingCluster !== null &&
          leadingCluster.scrollWidth > leadingCluster.clientWidth + 1;
        const nextStep = resolveNextComposerFooterTier({
          currentTier: composerFooterTierRef.current,
          clientWidth: footerRow.clientWidth,
          isOverflowing: rowOverflows || leadingClips,
          demotionWidths: composerFooterDemotionWidthsRef.current,
        });
        composerFooterDemotionWidthsRef.current = nextStep.demotionWidths;
        if (nextStep.tier !== composerFooterTierRef.current) {
          composerFooterTierRef.current = nextStep.tier;
          setComposerFooterTier(nextStep.tier);
        }
      }
    };
    composerFooterLayoutSyncRef.current = syncComposerFooterLayout;

    const measuredHeight = Math.ceil(composerForm.getBoundingClientRect().height);
    composerFormHeightRef.current = measuredHeight;
    if (measuredHeight > 0) {
      setSecondaryChromePlaceholderHeight((current) =>
        current === measuredHeight ? current : measuredHeight,
      );
    }
    syncComposerFooterLayout();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;

      syncComposerFooterLayout();

      const nextHeight = entry.contentRect.height;
      composerFormHeightRef.current = nextHeight;
      const roundedNextHeight = Math.ceil(nextHeight);
      if (roundedNextHeight > 0) {
        setSecondaryChromePlaceholderHeight((current) =>
          current === roundedNextHeight ? current : roundedNextHeight,
        );
      }
    });

    observer.observe(composerForm);
    return () => {
      observer.disconnect();
    };
  }, [
    setIsComposerFooterCompact,
    setComposerFooterTier,
    composerFooterTierRef,
    composerFooterDemotionWidthsRef,
    composerFooterLayoutSyncRef,
    setSecondaryChromePlaceholderHeight,
    composerFormRef,
    composerFormHeightRef,
    activeThread?.id,
    composerFooterHasWideActions,
    isInactiveSplitPane,
  ]);

  useEffect(() => {
    // Capture the carried sidebar-open intent synchronously (ref reads/writes stay
    // in render->commit order); defer only the setState so this thread-change reset
    // stays out of the render->effect->render cascade.
    const openPlanSidebar = planSidebarOpenOnNextThreadRef.current;
    planSidebarOpenOnNextThreadRef.current = false;
    planSidebarDismissedForTurnRef.current = null;
    const settle = window.setTimeout(() => {
      setPullRequestDialogState(null);
      setRenameDialogOpen(false);

      setPlanSidebarOpen(openPlanSidebar);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [
    setPlanSidebarOpen,
    planSidebarDismissedForTurnRef,
    planSidebarOpenOnNextThreadRef,
    setPullRequestDialogState,
    setRenameDialogOpen,
    activeThread?.id,
  ]);

  useEffect(() => {
    if (!composerMenuOpen) {
      setComposerHighlightedItemId(null);
      return;
    }
    setComposerHighlightedItemId((existing) =>
      existing && composerMenuItems.some((item) => item.id === existing)
        ? existing
        : (composerMenuItems[0]?.id ?? null),
    );
  }, [setComposerHighlightedItemId, composerMenuItems, composerMenuOpen]);

  useEffect(() => {
    // Async setState (post-paint) keeps this thread-change reset out of the
    // render->effect->render cascade.
    const settle = window.setTimeout(() => {
      setIsRevertingCheckpoint(false);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [setIsRevertingCheckpoint, activeThread?.id]);

  useEffect(() => {
    if (!activeThread?.id || terminalState.terminalOpen || isInactiveSplitPane) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeThread?.id, focusComposer, isInactiveSplitPane, terminalState.terminalOpen]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);

  useEffect(() => {
    composerFilesRef.current = composerFiles;
  }, [composerFiles]);

  useEffect(() => {
    composerAssistantSelectionsRef.current = composerAssistantSelections;
  }, [composerAssistantSelections]);

  useEffect(() => {
    composerBrowserAnnotationsRef.current = composerBrowserAnnotations;
  }, [composerBrowserAnnotations]);

  useEffect(() => {
    composerTerminalContextsRef.current = composerTerminalContexts;
  }, [composerTerminalContexts]);

  useEffect(() => {
    composerFileCommentsRef.current = composerFileComments;
  }, [composerFileComments]);

  useEffect(() => {
    composerPastedTextsRef.current = composerPastedTexts;
  }, [composerPastedTexts]);

  useEffect(() => {
    queuedComposerTurnsRef.current = queuedComposerTurns;
  }, [queuedComposerTurns]);

  useEffect(() => {
    autoDispatchingQueuedTurnRef.current = false;
  }, [threadId]);

  useLayoutEffect(() => {
    claimQueuedComposerAutoDispatch(threadId);
    setQueuedSteerGate(getQueuedComposerSteerGate(threadId));
    return () => {
      releaseQueuedComposerAutoDispatch(threadId);
    };
  }, [threadId]);

  useEffect(() => {
    if (!activeThread?.id) return;
    if (activeThread.messages.length === 0) {
      return;
    }
    // No optimistic messages → nothing to reconcile; skip the full-transcript id Set
    // this effect would otherwise rebuild on every streaming flush.
    if (optimisticUserMessages.length === 0) {
      return;
    }
    const serverIds = new Set(activeThread.messages.map((message) => message.id));
    const removedMessages = optimisticUserMessages.filter((message) => serverIds.has(message.id));
    if (removedMessages.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOptimisticUserMessages((existing) =>
        existing.filter((message) => !serverIds.has(message.id)),
      );
    }, 0);
    for (const removedMessage of removedMessages) {
      const previewUrls = collectUserMessageBlobPreviewUrls(removedMessage);
      if (previewUrls.length > 0) {
        handoffAttachmentPreviews(removedMessage.id, previewUrls);
        continue;
      }
      revokeUserMessagePreviewUrls(removedMessage);
    }
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeThread?.id, activeThread?.messages, handoffAttachmentPreviews, optimisticUserMessages]);

  useEffect(() => {
    promptRef.current = prompt;
    if (
      promptHistoryNavigationRef.current !== null &&
      prompt !== promptHistoryAppliedPromptRef.current
    ) {
      // Another writer (queued-turn restore, automation restore, insertion)
      // replaced the prompt while a history browse was active. The new prompt
      // is authoritative: end the browse and drop the saved pre-browse draft
      // so it cannot clobber this prompt later.
      promptHistoryNavigationRef.current = null;
      expectedPromptHistoryPromptRef.current = null;
      setComposerDraftPromptHistorySavedDraft(threadId, null);
    }
    setComposerCursor((existing) => clampCollapsedComposerCursor(prompt, existing));
  }, [prompt, setComposerDraftPromptHistorySavedDraft, threadId]);

  useLayoutEffect(() => {
    updateSelectedComposerSkills(composerSkills);
    updateSelectedComposerMentions(composerMentions);
  }, [
    composerMentions,
    composerSkills,
    threadId,
    updateSelectedComposerMentions,
    updateSelectedComposerSkills,
  ]);

  useEffect(() => {
    updateSelectedComposerSkills((existing) => {
      const nextSkills = filterPromptSkillReferences(prompt, existing, selectedProvider);
      return providerSkillReferencesEqual(existing, nextSkills) ? existing : nextSkills;
    });
  }, [prompt, selectedProvider, updateSelectedComposerSkills]);

  useEffect(() => {
    updateSelectedComposerMentions((existing) => {
      const nextMentions = filterPromptProviderMentionReferences(prompt, existing);
      return providerMentionReferencesEqual(existing, nextMentions) ? existing : nextMentions;
    });
  }, [prompt, updateSelectedComposerMentions]);

  // Provider references are provider-specific; keep draft restores from looking like manual switches.
  useEffect(() => {
    const previous = previousSelectedProviderRef.current;
    previousSelectedProviderRef.current = {
      threadId,
      provider: selectedProvider,
    };
    if (!previous || previous.threadId !== threadId || previous.provider === selectedProvider) {
      return;
    }
    updateSelectedComposerSkills([]);
    updateSelectedComposerMentions([]);
  }, [selectedProvider, threadId, updateSelectedComposerMentions, updateSelectedComposerSkills]);

  useLayoutEffect(() => {
    // ChatView stays mounted across thread switches, so clear thread-local overlays before paint.
    setOptimisticUserMessages((existing) => {
      if (existing.length === 0) return existing;
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    setExpandedImage(null);
  }, [threadId]);

  useEffect(() => {
    dragDepthRef.current = 0;
    // Async setState (post-paint) keeps this thread-change reset out of the
    // render->effect->render cascade. The expanded image and timeline hook's
    // optimistic messages clear before paint, so these residual resets can wait.
    const settle = window.setTimeout(() => {
      setLocalDispatch(null);
      setComposerHighlightedItemId(null);
      setComposerCursor(
        collapseExpandedComposerCursor(promptRef.current, promptRef.current.length),
      );
      setComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
      setIsDragOverComposer(false);
    }, 0);
    return () => window.clearTimeout(settle);
  }, [
    promptRef,
    setComposerCursor,
    setComposerTrigger,
    setIsDragOverComposer,
    setComposerHighlightedItemId,
    dragDepthRef,
    setLocalDispatch,
    threadId,
  ]);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, [setExpandedImage]);
  const navigateExpandedImage = useCallback(
    (direction: -1 | 1) => {
      setExpandedImage((existing) => {
        if (!existing || existing.images.length <= 1) {
          return existing;
        }
        const nextIndex =
          (existing.index + direction + existing.images.length) % existing.images.length;
        if (nextIndex === existing.index) {
          return existing;
        }
        return { ...existing, index: nextIndex };
      });
    },
    [setExpandedImage],
  );

  useEffect(() => {
    if (!expandedImage) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeExpandedImage();
        return;
      }
      if (expandedImage.images.length <= 1) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateExpandedImage(-1);
        return;
      }
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      navigateExpandedImage(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeExpandedImage, expandedImage, navigateExpandedImage]);

  useEffect(() => {
    if (!composerMenuOpen) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setComposerCommandPicker(null);
      setComposerHighlightedItemId(null);
      setComposerTrigger(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    setComposerTrigger,
    setComposerCommandPicker,
    setComposerHighlightedItemId,
    composerMenuOpen,
  ]);

  const activeWorktreePath = isStudioContainer ? null : activeThread?.worktreePath;
  const envMode: DraftThreadEnvMode = isStudioContainer
    ? "local"
    : isServerThread
      ? resolveThreadEnvironmentMode({
          envMode: activeThread?.envMode,
          worktreePath: activeWorktreePath ?? null,
        })
      : (draftThread?.envMode ?? "local");
  const envState = resolveThreadWorkspaceState({
    envMode: resolvedThreadEnvMode,
    worktreePath: resolvedThreadWorktreePath,
  });

  useEffect(() => {
    if (!activeThreadId) return;
    const previous = terminalOpenByThreadRef.current[activeThreadId] ?? false;
    const current = Boolean(terminalState.terminalOpen);

    if (!previous && current) {
      terminalOpenByThreadRef.current[activeThreadId] = current;
      requestTerminalFocus();
      return;
    } else if (previous && !current) {
      terminalOpenByThreadRef.current[activeThreadId] = current;
      const frame = window.requestAnimationFrame(() => {
        focusComposer();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    terminalOpenByThreadRef.current[activeThreadId] = current;
  }, [
    terminalOpenByThreadRef,
    activeThreadId,
    focusComposer,
    requestTerminalFocus,
    terminalState.terminalOpen,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      activatedThreadIdRef.current = null;
      return;
    }
    if (activatedThreadIdRef.current === activeThreadId) {
      return;
    }
    activatedThreadIdRef.current = activeThreadId;
    if (terminalState.entryPoint !== "terminal") {
      return;
    }
    storeOpenTerminalThreadPage(activeThreadId);
  }, [activatedThreadIdRef, activeThreadId, storeOpenTerminalThreadPage, terminalState.entryPoint]);

  useEffect(() => {
    if (!terminalWorkspaceOpen) {
      return;
    }

    if (terminalState.workspaceActiveTab === "terminal") {
      requestTerminalFocus();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    focusComposer,
    requestTerminalFocus,
    terminalState.workspaceActiveTab,
    terminalWorkspaceOpen,
  ]);

  const onInterrupt = useCallback(async () => {
    const api = readNativeApi();
    if (!api || !activeThread) return;
    await api.orchestration.dispatchCommand({
      type: "thread.turn.interrupt",
      commandId: newCommandId(),
      threadId: activeThread.id,
      createdAt: new Date().toISOString(),
    });
  }, [activeThread]);

  // A rejected interrupt (orchestration dispatch timeout, dead runtime) leaves the
  // UI spinning with no explanation, so the stop affordances report it.
  const onInterruptFromStopControl = useCallback(() => {
    void onInterrupt().catch((error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Could not stop the current response",
        description:
          error instanceof Error
            ? error.message
            : "The interrupt request failed. Try again in a moment.",
      });
    });
  }, [onInterrupt]);

  const onStopWorkflowRun = useCallback(async () => {
    const api = readNativeApi();
    if (!api || !activeThread || !workflowRunState) return;
    await api.orchestration.dispatchCommand({
      type: "thread.task.stop",
      commandId: newCommandId(),
      threadId: activeThread.id,
      taskId: workflowRunState.workflowTaskId,
      createdAt: new Date().toISOString(),
    });
  }, [activeThread, workflowRunState]);

  const onBackgroundSubagentStripItem = useCallback(
    async (item: ComposerSubagentStripItem) => {
      const api = readNativeApi();
      // The Task tool_use lives on the strip source thread (the parent while a
      // subagent thread is open), so route the command there.
      if (!api || !stripSourceThreadId) return;
      await api.orchestration.dispatchCommand({
        type: "thread.task.background",
        commandId: newCommandId(),
        threadId: stripSourceThreadId,
        toolUseId: item.providerThreadId,
        createdAt: new Date().toISOString(),
      });
    },
    [stripSourceThreadId],
  );

  // Stop goes through the interrupt seam: on a subagent thread the reactor
  // resolves the tool_use_id and stops that task instead of the whole turn.
  // Target the canonical child id derived from the strip source thread —
  // item.threadId can still be the raw tool_use_id while client-side thread
  // resolution lags, which the server would reject as an unknown thread.
  const onStopSubagentStripItem = useCallback(
    async (item: ComposerSubagentStripItem) => {
      const api = readNativeApi();
      if (!api || !stripSourceThreadId) return;
      await api.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: localSubagentThreadId(stripSourceThreadId, item.providerThreadId),
        createdAt: new Date().toISOString(),
      });
    },
    [stripSourceThreadId],
  );

  // Stop-all fans out through the same per-row stop so both paths share one seam.
  const onStopAllSubagentStripItems = useCallback(async () => {
    const running = collectRunningSubagentStripItems(composerSubagentStripItems);
    await Promise.all(running.map((item) => onStopSubagentStripItem(item)));
  }, [composerSubagentStripItems, onStopSubagentStripItem]);

  // Ctrl+B parity with the native CLI: send every foreground running subagent to
  // the background at once, fanning through the same per-row background dispatch.
  const onBackgroundAllForegroundSubagentStripItems = useCallback(async () => {
    const foreground = collectForegroundRunningSubagentStripItems(composerSubagentStripItems);
    await Promise.all(foreground.map((item) => onBackgroundSubagentStripItem(item)));
  }, [composerSubagentStripItems, onBackgroundSubagentStripItem]);

  // Pause is the same stop command; the persisted flag makes the settled card
  // read as paused (with a resume affordance) instead of plain stopped, across
  // reloads too.
  const onPauseWorkflowRun = useCallback(async () => {
    if (!workflowRunState || !activeThreadId) return;
    const { workflowTaskId } = workflowRunState;
    markWorkflowRunPaused(activeThreadId, workflowTaskId);
    await onStopWorkflowRun();
  }, [activeThreadId, markWorkflowRunPaused, onStopWorkflowRun, workflowRunState]);

  const onDismissWorkflowRun = useCallback(() => {
    if (!workflowRunState || !activeThreadId) return;
    const { workflowTaskId } = workflowRunState;
    markWorkflowRunDismissed(activeThreadId, workflowTaskId);
  }, [activeThreadId, markWorkflowRunDismissed, workflowRunState]);

  const onProviderModelSelect = useCallback(
    async (provider: ProviderKind, model: ModelSlug) => {
      if (!activeThread) return;
      if (lockedProvider !== null && provider !== lockedProvider) {
        scheduleComposerFocus();
        return;
      }
      const resolvedModel = resolveCommittedProviderModel({
        selectedModel: model,
        availableOptions: modelOptionsByProvider[provider],
        fallback: () => resolveAppModelSelection(provider, customModelsByProvider, model),
      });
      const runtimeModel = resolveRuntimeModelDescriptor({
        provider,
        model: resolvedModel,
        runtimeModels: runtimeModelsByProvider[provider],
      });
      const nextModelSelection = buildModelSelection(
        provider,
        resolvedModel,
        undefined,
        provider === "claudeAgent" ? runtimeModel?.supportsAutoMode : undefined,
      );
      const providerStatus = findProviderStatus(providerStatuses, provider);
      const nextRuntimeMode =
        runtimeMode === "auto" &&
        !providerModelSupportsAutoRuntimeMode(provider, runtimeModel, providerStatus)
          ? "approval-required"
          : normalizeRuntimeModeForProvider(runtimeMode, provider);
      // Commit the canonical downgrade before storing an incompatible model.
      // On failure the Auto draft remains visible so compatibility checks can retry.
      const didCommitSelection = await commitAfterRuntimeModePersistence({
        currentRuntimeMode: runtimeMode,
        nextRuntimeMode,
        persistRuntimeMode: persistRuntimeModeChange,
        commit: () => {
          setComposerDraftModelSelectionAndSticky(activeThread.id, nextModelSelection);
          if (provider === "cursor") {
            setComposerDraftProviderModelOptions(activeThread.id, provider, undefined, {
              persistSticky: true,
              model: resolvedModel,
            });
          }
        },
      });
      if (!didCommitSelection) {
        scheduleComposerFocus();
        return;
      }
      scheduleComposerFocus();
    },
    [
      activeThread,
      customModelsByProvider,
      lockedProvider,
      modelOptionsByProvider,
      persistRuntimeModeChange,
      providerStatuses,
      runtimeMode,
      runtimeModelsByProvider,
      scheduleComposerFocus,
      setComposerDraftModelSelectionAndSticky,
      setComposerDraftProviderModelOptions,
    ],
  );

  const copyThreadIdToClipboard = useCopyThreadIdToClipboard();

  useChatKeyboardShortcuts({
    onToggleDevicePanel,
    onSplitSurface,
    surfaceMode,
    isFocusedPane,
    activeThreadId,
    hasLiveTurn,
    composerFormRef,
    onInterruptFromStopControl,
    composerSubagentStripItems,
    onBackgroundAllForegroundSubagentStripItems,
    isVoiceRecording,
    isVoiceTranscribing,
    isComposerApprovalState,
    terminalState,
    terminalWorkspaceOpen,
    terminalWorkspaceTerminalTabActive,
    terminalWorkspaceChatTabActive,
    keybindings,
    toggleComposerFocus,
    shouldRenderChatPaneContent,
    setThreadFindOpen,
    setThreadFindFocusNonce,
    handleModelPickerOpenChange,
    scheduleComposerFocus,
    modelOptionsByProvider,
    selectedProvider,
    selectedModel,
    onProviderModelSelect,
    handleTraitsPickerOpenChange,
    toggleTerminalVisibility,
    setTerminalOpen,
    splitTerminalRight,
    splitTerminalLeft,
    splitTerminalDown,
    splitTerminalUp,
    closeTerminal,
    createTerminalFromShortcut,
    openNewFullWidthTerminal,
    closeActiveWorkspaceView,
    setTerminalWorkspaceTab,
    onToggleDiff,
    commitAndPushTriggerRef,
    showGitActions,
    isGitRepo,
    onToggleBrowser,
    copyThreadIdToClipboard,
    activeProject,
    runProjectScript,
    activeThread,
  });

  // Preserve the original "single mic button" contract:
  // first click starts recording, the next click submits/transcribes.
  const toggleComposerVoiceRecording = useCallback(() => {
    if (isVoiceTranscribing) {
      return;
    }
    if (isVoiceRecording) {
      void submitComposerVoiceRecording();
      return;
    }
    void startComposerVoiceRecording();
  }, [
    isVoiceRecording,
    isVoiceTranscribing,
    startComposerVoiceRecording,
    submitComposerVoiceRecording,
  ]);

  // --- Composer attachment entry points -------------------------------------
  const addComposerImages = useCallback(
    (files: readonly File[]) => {
      if (!activeThreadId || files.length === 0) return;

      if (pendingUserInputs.length > 0) {
        toastManager.add({
          type: "error",
          title: "Attach images after answering plan questions.",
        });
        return;
      }

      enqueueComposerImages(files);
    },
    [activeThreadId, enqueueComposerImages, pendingUserInputs.length],
  );

  const removeComposerImage = (imageId: string) => {
    removeComposerImageFromDraft(imageId);
  };

  const addComposerFiles = useCallback(
    (files: readonly File[]) => {
      if (!activeThreadId || files.length === 0) return;

      if (pendingUserInputs.length > 0) {
        toastManager.add({
          type: "error",
          title: "Attach files after answering plan questions.",
        });
        return;
      }

      const { files: nextFiles, error } = buildComposerFileAttachmentsFromFiles({
        files,
        existingAttachmentCount: effectiveComposerAttachmentCount(
          useComposerDraftStore.getState().draftsByThreadId[activeThreadId],
        ),
      });

      const insertedCount = nextFiles.length > 0 ? addComposerFilesToDraft(nextFiles) : 0;
      setThreadError(
        activeThreadId,
        insertedCount < nextFiles.length
          ? `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} references per message.`
          : error,
      );
    },
    [activeThreadId, addComposerFilesToDraft, pendingUserInputs.length, setThreadError],
  );

  const addComposerAttachments = useCallback(
    (files: readonly File[]) => {
      const { imageFiles, genericFiles } = splitComposerDropzoneFiles(files);
      if (imageFiles.length > 0) {
        addComposerImages(imageFiles);
      }
      if (genericFiles.length > 0) {
        addComposerFiles(genericFiles);
      }
    },
    [addComposerFiles, addComposerImages],
  );

  const removeComposerFile = (fileId: string) => {
    discardPromptHistoryNavigationForComposerMutation();
    removeComposerDraftFile(threadId, fileId);
  };

  const {
    onComposerPaste,
    onComposerDragEnter,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
  } = useComposerDropzone({
    addImages: addComposerImages,
    fileSupport: {
      genericFiles: "accept",
      addFiles: addComposerFiles,
    },
    appendReferenceText: (referenceText) => appendComposerPromptText(threadId, referenceText),
    appendPathMentions: (paths) => {
      for (const absolutePath of paths) {
        appendComposerPromptText(threadId, formatComposerMentionToken(absolutePath));
      }
    },
    dragDepthRef,
    focusComposer,
    setIsDragOverComposer,
  });

  const onRevertToTurnCount = useCallback(
    async (turnCount: number) => {
      const api = readNativeApi();
      if (!api || !activeThread || isRevertingCheckpoint) return;

      if (hasLiveTurn || isSendBusy || isConnecting) {
        setThreadError(activeThread.id, "Interrupt the current turn before reverting checkpoints.");
        return;
      }
      const checkpointMessage = [
        `Revert this thread to checkpoint ${turnCount}?`,
        "This will discard newer messages and turn diffs in this thread.",
        "This action cannot be undone.",
      ].join("\n");
      const confirmed = await confirmCoreAction({
        confirmation: {
          stableKey: `checkpoint-revert:${activeThread.id}:${turnCount}`,
          title: `Revert to checkpoint ${turnCount}?`,
          description:
            "This will discard newer messages and turn diffs in this thread. This action cannot be undone.",
          confirmLabel: "Revert",
          destructive: true,
        },
        defaultConfirm: () => api.dialogs.confirm(checkpointMessage),
      });
      if (!confirmed) {
        return;
      }

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.checkpoint.revert",
          commandId: newCommandId(),
          threadId: activeThread.id,
          turnCount,
          scope: "thread",
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        setThreadError(
          activeThread.id,
          err instanceof Error ? err.message : "Failed to revert thread state.",
        );
      }
      setIsRevertingCheckpoint(false);
    },
    [
      setIsRevertingCheckpoint,
      activeThread,
      hasLiveTurn,
      isConnecting,
      isRevertingCheckpoint,
      isSendBusy,
      setThreadError,
    ],
  );

  const onUndoTurnFiles = useCallback(
    async (turnCounts: readonly number[]) => {
      const api = readNativeApi();
      if (!api || !activeThread || isRevertingCheckpoint || turnCounts.length === 0) return;

      if (hasLiveTurn || isSendBusy || isConnecting) {
        setThreadError(activeThread.id, "Interrupt the current turn before undoing file changes.");
        return;
      }
      const undoMessage = [
        "Undo the file changes shown in this card?",
        "Earlier file changes will remain available to undo.",
        "Messages and provider conversation history will be kept.",
        "This action cannot be undone.",
      ].join("\n");
      const confirmed = await confirmCoreAction({
        confirmation: {
          stableKey: `turn-files-undo:${activeThread.id}:${turnCounts.join(":")}`,
          title: "Undo these file changes?",
          description:
            "Earlier changes and conversation history remain. This action cannot be undone.",
          confirmLabel: "Undo files",
          destructive: true,
        },
        defaultConfirm: () => api.dialogs.confirm(undoMessage),
      });
      if (!confirmed) return;

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      // The card can merge several turns. The server refuses to undo a turn while
      // newer file changes are still applied, so revert newest-first and stop at
      // the first failure rather than leaving the card half-undone silently.
      const orderedTurnCounts = [...new Set(turnCounts)].toSorted((left, right) => right - left);
      const requestedAt = new Date().toISOString();
      setPendingFileUndo({
        threadId: activeThread.id,
        turnCounts: orderedTurnCounts,
        existingFailureActivityIds: activeThread.activities
          .filter((activity) => activity.kind === "checkpoint.revert.failed")
          .map((activity) => activity.id),
      });
      const dispatchReverts = async () => {
        for (const turnCount of orderedTurnCounts) {
          await api.orchestration.dispatchCommand({
            type: "thread.checkpoint.revert",
            commandId: newCommandId(),
            threadId: activeThread.id,
            turnCount,
            scope: "files",
            createdAt: requestedAt,
          });
        }
      };
      await dispatchReverts().catch((err: unknown) => {
        setPendingFileUndo(null);
        setIsRevertingCheckpoint(false);
        setThreadError(
          activeThread.id,
          err instanceof Error ? err.message : "Failed to undo file changes.",
        );
      });
    },
    [
      setIsRevertingCheckpoint,
      setPendingFileUndo,
      activeThread,
      hasLiveTurn,
      isConnecting,
      isRevertingCheckpoint,
      isSendBusy,
      setThreadError,
    ],
  );

  const onCreateHandoffThread = useCallback(
    async (targetProvider: ProviderKind) => {
      if (!activeThread || handoffDisabled) {
        return;
      }

      try {
        await createThreadHandoff(activeThread, targetProvider);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not create handoff thread",
          description:
            error instanceof Error
              ? error.message
              : "An error occurred while creating the handoff thread.",
        });
      }
    },
    [activeThread, createThreadHandoff, handoffDisabled],
  );

  const clearComposerInput = useCallback(
    (threadId: ThreadId) => {
      promptHistoryNavigationRef.current = null;
      applyingPromptHistoryNavigationRef.current = false;
      expectedPromptHistoryPromptRef.current = null;
      promptRef.current = "";
      setRestoredQueuedSourceProposedPlan(threadId, null);
      clearComposerDraftContent(threadId);
      updateSelectedComposerSkills([]);
      updateSelectedComposerMentions([]);
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);
    },
    [
      promptRef,
      setComposerCursor,
      setComposerTrigger,
      promptHistoryNavigationRef,
      applyingPromptHistoryNavigationRef,
      expectedPromptHistoryPromptRef,
      setComposerHighlightedItemId,
      clearComposerDraftContent,
      setRestoredQueuedSourceProposedPlan,
      updateSelectedComposerMentions,
      updateSelectedComposerSkills,
    ],
  );

  const { createAutomationFromForm, prepareAutomationFormForCreate, submitAutomationDraft } =
    useChatAutomationCreation({
      threadId,
      activeProject,
      automationDraftSubmittingRef,
      isServerThread,
      activeThread,
      providerOptionsForDispatch,
      setIsAutomationDraftSubmitting,
      queryClient,
      clearComposerInput,
      resetAutomationDraftState,
      activeThreadAssociatedWorktree,
      threadNotes,
      selectedModelSelection,
      runtimeMode,
      interactionMode,
      automationDraftForm,
      automationDraftWarnings,
      acknowledgedAutomationWarnings,
    });

  const restoreQueuedTurnToComposer = useCallback(
    (queuedTurn: QueuedComposerTurn) => {
      if (!activeThread) {
        return;
      }
      const nextPrompt = queuedTurn.kind === "chat" ? queuedTurn.prompt : queuedTurn.text;
      const restoredImages =
        queuedTurn.kind === "chat" ? queuedTurn.images.map(cloneComposerImageAttachment) : [];
      const restoredFiles = queuedTurn.kind === "chat" ? queuedTurn.files : [];
      const restoredAssistantSelections =
        queuedTurn.kind === "chat" ? queuedTurn.assistantSelections : [];
      const restoredBrowserAnnotations =
        queuedTurn.kind === "chat" ? queuedTurn.browserAnnotations : [];
      const restoredFileComments = queuedTurn.kind === "chat" ? queuedTurn.fileComments : [];
      promptRef.current = nextPrompt;
      clearComposerDraftContent(activeThread.id);
      setComposerDraftPrompt(activeThread.id, nextPrompt);
      setComposerDraftMakeNoMistakeLevel(activeThread.id, queuedTurn.makeNoMistakeLevel ?? 0);
      // Editing a queued turn should recreate the same draft state the user queued.
      setDraftThreadContext(activeThread.id, {
        runtimeMode: queuedTurn.runtimeMode,
        interactionMode: queuedTurn.interactionMode,
        ...(queuedTurn.kind === "chat" ? { envMode: queuedTurn.envMode } : {}),
      });
      if (queuedTurn.kind === "chat") {
        if (restoredImages.length > 0) {
          addComposerImagesToDraft(restoredImages);
        }
        if (restoredFiles.length > 0) {
          addComposerFilesToDraft(restoredFiles);
        }
        for (const selection of restoredAssistantSelections) {
          addComposerAssistantSelectionToDraft(selection);
        }
        if (restoredBrowserAnnotations.length > 0) {
          addComposerDraftBrowserAnnotations(activeThread.id, restoredBrowserAnnotations);
        }
        for (const comment of restoredFileComments) {
          addComposerFileCommentToDraft(comment);
        }
        if (queuedTurn.terminalContexts.length > 0) {
          addComposerTerminalContextsToDraft(queuedTurn.terminalContexts);
        }
        if (queuedTurn.pastedTexts.length > 0) {
          addComposerPastedTextsToDraft(queuedTurn.pastedTexts);
        }
        updateSelectedComposerSkills(queuedTurn.skills);
        updateSelectedComposerMentions(queuedTurn.mentions);
      } else {
        updateSelectedComposerSkills([]);
        updateSelectedComposerMentions([]);
      }
      setRestoredQueuedSourceProposedPlan(
        activeThread.id,
        queuedTurn.kind === "chat" && queuedTurn.sourceProposedPlan
          ? {
              threadId: activeThread.id,
              restoredPrompt: nextPrompt,
              sourceProposedPlan: queuedTurn.sourceProposedPlan,
            }
          : null,
      );
      setComposerDraftModelSelection(activeThread.id, queuedTurn.modelSelection);
      setComposerDraftRuntimeMode(activeThread.id, queuedTurn.runtimeMode);
      setComposerDraftInteractionMode(activeThread.id, queuedTurn.interactionMode);
      setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      scheduleComposerFocus();
    },
    [
      activeThread,
      addComposerAssistantSelectionToDraft,
      addComposerDraftBrowserAnnotations,
      addComposerFileCommentToDraft,
      addComposerFilesToDraft,
      addComposerImagesToDraft,
      addComposerTerminalContextsToDraft,
      addComposerPastedTextsToDraft,
      clearComposerDraftContent,
      scheduleComposerFocus,
      setDraftThreadContext,
      setRestoredQueuedSourceProposedPlan,
      setComposerDraftInteractionMode,
      setComposerDraftModelSelection,
      setComposerDraftMakeNoMistakeLevel,
      setComposerDraftPrompt,
      setComposerDraftRuntimeMode,
      updateSelectedComposerMentions,
      updateSelectedComposerSkills,
    ],
  );

  const removeQueuedComposerTurn = useCallback(
    (queuedTurnId: string) => {
      removeQueuedComposerTurnFromDraft(threadId, queuedTurnId);
    },
    [removeQueuedComposerTurnFromDraft, threadId],
  );

  // See `LateComposerSendHandlers`: declared here so both `dispatchQueuedComposerTurn` (above)
  // and `onSend` (below) can reach handlers that are only declared further down.
  const lateComposerSendHandlersRef = useRef<LateComposerSendHandlers | null>(null);

  const onSend = async (
    e?: { preventDefault: () => void },
    requestedDispatchMode?: "queue" | "steer",
    queuedTurn?: QueuedComposerChatTurn,
  ): Promise<boolean> => {
    const dispatchMode =
      requestedDispatchMode ??
      resolveFollowUpDispatchMode({
        behavior: settings.followUpBehavior,
        hasLiveTurn,
      });
    e?.preventDefault();
    const api = readNativeApi();
    const lateSendHandlers = lateComposerSendHandlersRef.current;
    if (
      !api ||
      !lateSendHandlers ||
      !activeThread ||
      isSendBusy ||
      isConnecting ||
      isVoiceTranscribing ||
      sendPreflightInFlightRef.current ||
      sendInFlightRef.current
    ) {
      return false;
    }
    if (!queuedTurn) {
      sendPreflightInFlightRef.current = true;
      await waitForPendingComposerImages();
      sendPreflightInFlightRef.current = false;
    }
    if (activePendingProgress) {
      const activeQuestion = activePendingProgress.activeQuestion;
      const liveComposerSnapshot = composerEditorRef.current?.readSnapshot() ?? null;
      const livePendingAnswerText = liveComposerSnapshot?.value ?? promptRef.current;
      const currentDraftAnswer =
        activePendingUserInputKey && activeQuestion
          ? pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey]?.[
              activeQuestion.id
            ]
          : undefined;
      const answerOverrides =
        activeQuestion && livePendingAnswerText.trim().length > 0
          ? {
              [activeQuestion.id]: setPendingUserInputCustomAnswer(
                currentDraftAnswer,
                livePendingAnswerText,
              ),
            }
          : undefined;
      if (activePendingUserInputKey && answerOverrides) {
        const nextRequestAnswers = {
          ...pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey],
          ...answerOverrides,
        };
        pendingUserInputAnswersByRequestIdRef.current = {
          ...pendingUserInputAnswersByRequestIdRef.current,
          [activePendingUserInputKey]: nextRequestAnswers,
        };
        setPendingUserInputAnswersByRequestId((existing) => ({
          ...existing,
          [activePendingUserInputKey]: nextRequestAnswers,
        }));
      }
      return lateSendHandlers.advanceActivePendingUserInput(answerOverrides);
    }
    const queuedChatTurn = queuedTurn ?? null;
    const liveComposerSnapshot =
      queuedChatTurn === null ? (composerEditorRef.current?.readSnapshot() ?? null) : null;
    let promptForSend = queuedChatTurn?.prompt ?? liveComposerSnapshot?.value ?? promptRef.current;
    let composerImagesForSend =
      queuedChatTurn?.images ??
      useComposerDraftStore.getState().draftsByThreadId[activeThread.id]?.images ??
      composerImages;
    // AppSnap captures persist as IndexedDB blobs and hydrate into `images`
    // asynchronously (see AppSnapCoordinator). Right after a reload the user can
    // hit send before that hydration finishes; without this, the not-yet-hydrated
    // capture would be silently dropped from the message and then have its blob
    // deleted when the composer clears after send. Live sends only: a queued turn
    // already captured a fully-resolved image snapshot when it was queued.
    if (queuedChatTurn === null) {
      const pendingBlobAttachments = findPendingBlobComposerAttachments({
        persistedAttachments:
          useComposerDraftStore.getState().draftsByThreadId[activeThread.id]
            ?.persistedAttachments ?? [],
        images: composerImagesForSend,
      });
      if (pendingBlobAttachments.length > 0) {
        const hydratedPendingImages =
          await hydratePendingBlobComposerAttachments(pendingBlobAttachments);
        if (hydratedPendingImages.length > 0) {
          composerImagesForSend = [...composerImagesForSend, ...hydratedPendingImages];
        }
      }
    }
    const composerFilesForSend = queuedChatTurn?.files ?? composerFiles;
    const composerAssistantSelectionsForSend =
      queuedChatTurn?.assistantSelections ?? composerAssistantSelections;
    const composerBrowserAnnotationsForSend =
      queuedChatTurn?.browserAnnotations ?? composerBrowserAnnotations;
    const composerFileCommentsForSend = queuedChatTurn?.fileComments ?? composerFileComments;
    const composerTerminalContextsForSend =
      queuedChatTurn?.terminalContexts ?? composerTerminalContexts;
    const composerPastedTextsForSend = queuedChatTurn?.pastedTexts ?? composerPastedTexts;
    const selectedComposerSkillsForSend =
      queuedChatTurn?.skills ?? selectedComposerSkillsRef.current;
    const selectedComposerMentionsForSend =
      queuedChatTurn?.mentions ?? selectedComposerMentionsRef.current;
    const selectedProviderForSend = queuedChatTurn?.selectedProvider ?? selectedProvider;
    const selectedModelForSend = queuedChatTurn?.selectedModel ?? selectedModel;
    const selectedPromptEffortForSend =
      queuedChatTurn?.selectedPromptEffort ?? selectedPromptEffort;
    const selectedModelSelectionForSend = queuedChatTurn?.modelSelection ?? selectedModelSelection;
    const providerOptionsForDispatchForSend =
      queuedChatTurn?.providerOptionsForDispatch ?? providerOptionsForDispatch;
    const runtimeModeForSend = queuedChatTurn?.runtimeMode ?? runtimeMode;
    let interactionModeForSend = queuedChatTurn?.interactionMode ?? interactionMode;
    const makeNoMistakeLevelForSend = queuedChatTurn?.makeNoMistakeLevel ?? makeNoMistakeLevel;
    const responseModifiersForSend = makeNoMistakeResponseModifiers(makeNoMistakeLevelForSend);
    const envModeForSend = queuedChatTurn?.envMode ?? envMode;
    const {
      trimmedPrompt: trimmed,
      sendableTerminalContexts: sendableComposerTerminalContexts,
      expiredTerminalContextCount,
      sendablePastedTexts: sendableComposerPastedTexts,
      hasSendableContent,
    } = deriveComposerSendState({
      prompt: promptForSend,
      imageCount: composerImagesForSend.length,
      fileCount: composerFilesForSend.length,
      assistantSelectionCount: composerAssistantSelectionsForSend.length,
      browserAnnotationCount: composerBrowserAnnotationsForSend.length,
      fileCommentCount: composerFileCommentsForSend.length,
      terminalContexts: composerTerminalContextsForSend,
      pastedTexts: composerPastedTextsForSend,
    });
    let trimmedPromptForSend = trimmed;
    const restoredQueuedPlanDraftSource =
      queuedChatTurn === null &&
      restoredQueuedSourceProposedPlanRef.current?.threadId === activeThread.id &&
      composerPromptStillMatchesRestoredQueuedDraft(
        restoredQueuedSourceProposedPlanRef.current.restoredPrompt,
        promptForSend,
      )
        ? restoredQueuedSourceProposedPlanRef.current
        : null;
    const isLivePlanFollowUpSubmission =
      queuedChatTurn === null &&
      restoredQueuedPlanDraftSource === null &&
      showPlanFollowUpPrompt &&
      activeProposedPlan !== null;
    const hasStructuredPlanFollowUpContent =
      composerImagesForSend.length > 0 ||
      composerFilesForSend.length > 0 ||
      composerAssistantSelectionsForSend.length > 0 ||
      composerBrowserAnnotationsForSend.length > 0 ||
      composerFileCommentsForSend.length > 0 ||
      sendableComposerTerminalContexts.length > 0 ||
      sendableComposerPastedTexts.length > 0;
    // Queued chat turns already captured their intended mode. Live plan follow-ups
    // with attachments must use the normal send path so references are preserved.
    if (isLivePlanFollowUpSubmission) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: trimmed,
        planMarkdown: activeProposedPlan.planMarkdown,
      });
      if (hasStructuredPlanFollowUpContent) {
        promptForSend = followUp.text;
        interactionModeForSend = followUp.interactionMode;
        trimmedPromptForSend = followUp.text.trim();
      } else {
        if (hasQueueableLiveTurn && dispatchMode === "queue") {
          clearComposerInput(activeThread.id);
          scheduleComposerFocus();
          enqueueQueuedComposerTurn(activeThread.id, {
            id: randomUUID(),
            kind: "plan-follow-up",
            createdAt: new Date().toISOString(),
            previewText: followUp.text.trim(),
            text: followUp.text,
            interactionMode: followUp.interactionMode,
            selectedProvider,
            selectedModel,
            selectedPromptEffort,
            modelSelection: selectedModelSelection,
            ...(providerOptionsForDispatch ? { providerOptionsForDispatch } : {}),
            runtimeMode,
            ...(makeNoMistakeLevelForSend > 0
              ? { makeNoMistakeLevel: makeNoMistakeLevelForSend }
              : {}),
          });
          return true;
        }
        clearComposerInput(activeThread.id);
        scheduleComposerFocus();
        return lateSendHandlers.submitPlanFollowUp({
          text: followUp.text,
          interactionMode: followUp.interactionMode,
          dispatchMode,
          makeNoMistakeLevel: makeNoMistakeLevelForSend,
        });
      }
    }
    const hasNoStructuredComposerContext =
      composerImagesForSend.length === 0 &&
      composerFilesForSend.length === 0 &&
      composerAssistantSelectionsForSend.length === 0 &&
      composerBrowserAnnotationsForSend.length === 0 &&
      composerFileCommentsForSend.length === 0 &&
      sendableComposerTerminalContexts.length === 0 &&
      sendableComposerPastedTexts.length === 0 &&
      // Provider mentions are structured turn metadata, and automation definitions persist text only.
      selectedComposerMentionsForSend.length === 0;
    const hasPromptOnlySendableContent = hasNoStructuredComposerContext;
    if (hasPromptOnlySendableContent) {
      const handledSlashCommand =
        await lateSendHandlers.handleStandaloneSlashCommand(trimmedPromptForSend);
      if (handledSlashCommand) {
        // A slash command (e.g. /clear) consumes the composer, so abandon any in-progress
        // automation setup rather than leaving a stale banner/request behind.
        pendingAutomationConversationRef.current = null;
        setPendingAutomationConversation(null);
        return true;
      }
    }
    const sourceProposedPlanForSend =
      queuedChatTurn?.sourceProposedPlan ??
      restoredQueuedPlanDraftSource?.sourceProposedPlan ??
      (isLivePlanFollowUpSubmission && activeProposedPlan && interactionModeForSend === "default"
        ? buildSourceProposedPlanReference({
            threadId: activeThread.id,
            proposedPlan: activeProposedPlan,
          })
        : undefined);
    if (!hasSendableContent) {
      if (expiredTerminalContextCount > 0) {
        const toastCopy = buildExpiredTerminalContextToastCopy(
          expiredTerminalContextCount,
          "empty",
        );
        toastManager.add({
          type: "warning",
          title: toastCopy.title,
          description: toastCopy.description,
        });
      }
      return false;
    }
    if (!activeProject) return false;
    if (queuedChatTurn === null && !isLivePlanFollowUpSubmission) {
      const conversation = pendingAutomationConversation;
      // While gathering missing details, fold the reply into the cleaned request so it
      // re-resolves as a whole rather than parsing the bare answer (and never re-parses
      // "could you create an automation" scaffolding as the task).
      const messageForAutomation = conversation
        ? `${conversation.accumulatedMessage}\n${trimmedPromptForSend}`
        : trimmedPromptForSend;
      const automationRequest = await resolveComposerAutomationRequest({
        message: messageForAutomation,
        cwd: threadWorkspaceCwd ?? activeProject.cwd,
        generateIntent: (request) => api.server.generateAutomationIntent(request),
      });
      // Drop a stale resolve: bail if the user switched threads, or cancelled/changed the
      // setup, while generateAutomationIntent was awaiting.
      if (
        activeThreadIdRef.current !== threadId ||
        pendingAutomationConversationRef.current !== conversation ||
        (!hasLiveTurn && hasLiveTurnRef.current)
      ) {
        return true;
      }
      if (automationRequest.type !== "normal-chat") {
        if (automationRequest.type === "needs-clarification") {
          // Conversational setup only runs for prompt-only sends while no turn is live:
          // clearing the composer would drop attachments/mentions Cancel can't restore,
          // and ephemeral setup bubbles must not anchor a running turn's work rows.
          if (!hasPromptOnlySendableContent || hasLiveTurn) {
            toastManager.add({
              type: "warning",
              title: "Automation needs a bit more detail",
              description:
                automationRequest.reason ??
                'Add what it should do and how often, e.g. "every weekday at 9am, summarize my PRs".',
            });
            return true;
          }
          // Render the exchange in-thread: echo the user's words as a bubble and ask for
          // what's missing as an assistant bubble. Nothing reaches a provider; the cleaned
          // automationMessage accumulates for the next re-resolve and for Cancel's restore.
          const question = automationClarificationPrompt(automationRequest.missingFields);
          const priorBubbles = conversation?.bubbles ?? [];
          // Drop the submitted request from the composer (it is captured in
          // accumulatedMessage, so re-folding it would duplicate the scaffold) while
          // preserving anything typed *after* it during the async resolve.
          const liveDraft = promptRef.current.trimStart();
          const leftover = liveDraft.startsWith(trimmedPromptForSend)
            ? liveDraft.slice(trimmedPromptForSend.length).trimStart()
            : liveDraft;
          promptRef.current = leftover;
          setComposerDraftPrompt(activeThread.id, leftover);
          setComposerTrigger(null);
          // Bring the new question into view even if the user had scrolled up.
          armTranscriptAutoFollow(activeThread.id, true);
          setPendingAutomationConversation({
            threadId: activeThread.id,
            accumulatedMessage: automationRequest.automationMessage,
            bubbles: [
              ...priorBubbles,
              makeAutomationSetupBubble("user", trimmedPromptForSend),
              makeAutomationSetupBubble("assistant", question),
            ],
          });
          return true;
        }

        pendingAutomationConversationRef.current = null;
        setPendingAutomationConversation(null);
        const automationIntent = automationRequest.resolution.intent;
        const automationTargetThreadId =
          automationIntent.executionScope === "thread" ? activeThread.id : null;
        const automationDraft = buildComposerAutomationDraft({
          resolution: automationRequest.resolution,
          projectId: activeProject.id,
          projectModelSelection: automationProjectModelSelection(
            automationProjects,
            activeProject.id,
          ),
          selectedModelSelection: selectedModelSelectionForSend,
          targetThreadId: automationTargetThreadId,
          hasEphemeralContext: !hasPromptOnlySendableContent,
        });
        // A multi-turn setup always confirms before creating, so the user reviews the
        // parsed task/schedule (and any scaffolding the parser kept) rather than it
        // silently auto-creating a recurring job.
        if (automationDraft.needsDraftReview || conversation !== null) {
          if (conversation !== null) {
            // Keep the full multi-turn request in the composer so dismissing the review
            // dialog doesn't lose it (the single-turn path likewise leaves its text).
            // Restore only the text; any attachments/mentions on the final reply stay.
            const liveDraft = promptRef.current.trimStart();
            const leftover = liveDraft.startsWith(trimmedPromptForSend)
              ? liveDraft.slice(trimmedPromptForSend.length).trimStart()
              : liveDraft;
            const restoredPrompt = leftover
              ? `${messageForAutomation}\n${leftover}`
              : messageForAutomation;
            promptRef.current = restoredPrompt;
            setComposerDraftPrompt(activeThread.id, restoredPrompt);
          }
          setAutomationDraftWarningContext(automationDraft.warningContext);
          setAutomationDraftForm(automationDraft.form);
          setAutomationDraftWarnings(automationDraft.warnings);
          setAcknowledgedAutomationWarnings(automationDraft.acknowledgedWarningIds);
          setAutomationDraftOpen(true);
          return true;
        }
        const preparedAutomation = await prepareAutomationFormForCreate(automationDraft.form);
        if (!preparedAutomation) {
          return true;
        }
        await createAutomationFromForm({
          form: preparedAutomation.form,
          warnings: automationDraft.warnings,
          acknowledgedWarningIds: automationDraft.acknowledgedWarningIds,
          activityThreadId: preparedAutomation.activityThreadId,
          ...(providerOptionsForDispatchForSend
            ? { providerOptions: providerOptionsForDispatchForSend }
            : {}),
        });
        return true;
      }
      if (conversation) {
        // The combined text no longer reads as an automation; abandon setup and let
        // this message send as a normal chat turn instead of looping on the question.
        pendingAutomationConversationRef.current = null;
        setPendingAutomationConversation(null);
      }
    }
    sendPreflightInFlightRef.current = true;
    const sendProviderAvailability = await resolveProviderSendAvailabilityWithRefresh({
      provider: selectedModelSelectionForSend.provider,
      statuses: providerStatuses,
      refreshStatuses: () => refreshProviderStatuses({ silent: true }),
    }).finally(() => {
      sendPreflightInFlightRef.current = false;
    });
    if (!sendProviderAvailability.usable) {
      toastManager.add({
        type: "error",
        title: sendProviderAvailability.unavailableReason,
      });
      return false;
    }

    const browserPromptAttachment: BrowserPromptAttachmentResolution =
      await maybeResolveBrowserPromptAttachment({
        api,
        threadId: activeThread.id,
        prompt: promptForSend,
      }).catch(
        (): BrowserPromptAttachmentResolution => ({
          requested: false,
          image: null,
        }),
      );
    if (browserPromptAttachment.image) {
      const nextAttachmentCount =
        composerImagesForSend.length +
        composerFilesForSend.length +
        composerAssistantSelectionsForSend.length +
        (browserPromptAttachment.image ? 1 : 0);
      if (nextAttachmentCount <= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        composerImagesForSend = [...composerImagesForSend, browserPromptAttachment.image];
      } else {
        toastManager.add({
          type: "warning",
          title: `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} references per message.`,
          description:
            "The current browser screenshot was skipped because this message is already at the attachment limit.",
        });
      }
    } else if (browserPromptAttachment.requested) {
      const description =
        browserPromptAttachment.reason === "no-open-browser"
          ? "Open the in-app browser first, then try again."
          : browserPromptAttachment.reason === "no-active-tab"
            ? "The in-app browser has no active tab to capture yet."
            : browserPromptAttachment.reason === "attachment-processing-failed"
              ? "The browser screenshot could not be optimized for attachment."
              : "The current browser context could not be attached.";
      toastManager.add({
        type: "warning",
        title: "Couldn’t attach the in-app browser context",
        description,
      });
    }

    const devicePromptAttachment: DevicePromptAttachmentResolution =
      await maybeResolveDevicePromptAttachment({
        api,
        threadId: activeThread.id,
        prompt: promptForSend,
      }).catch(
        (): DevicePromptAttachmentResolution => ({
          requested: false,
          image: null,
        }),
      );
    if (devicePromptAttachment.image) {
      const nextAttachmentCount =
        composerImagesForSend.length +
        composerFilesForSend.length +
        composerAssistantSelectionsForSend.length +
        1;
      if (nextAttachmentCount <= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        composerImagesForSend = [...composerImagesForSend, devicePromptAttachment.image];
      } else {
        toastManager.add({
          type: "warning",
          title: `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} references per message.`,
          description:
            "The simulator screenshot was skipped because this message is already at the attachment limit.",
        });
      }
    } else if (devicePromptAttachment.requested) {
      const description =
        devicePromptAttachment.reason === "no-attached-device"
          ? "Open the iOS Simulator panel and choose a device first, then try again."
          : devicePromptAttachment.reason === "device-not-booted"
            ? "The selected simulator is still starting up."
            : devicePromptAttachment.reason === "attachment-processing-failed"
              ? "The simulator screenshot could not be optimized for attachment."
              : "The current simulator context could not be attached.";
      toastManager.add({
        type: "warning",
        title: "Couldn’t attach the simulator screen",
        description,
      });
    }

    if (hasQueueableLiveTurn && dispatchMode === "queue" && queuedChatTurn === null) {
      clearComposerInput(activeThread.id);
      scheduleComposerFocus();
      const queuedImagesForPersistence = await Promise.all(
        composerImagesForSend.map(async (image) => {
          try {
            return {
              ...image,
              previewUrl: await readFileAsDataUrl(image.file),
            };
          } catch {
            return image;
          }
        }),
      );
      enqueueQueuedComposerTurn(activeThread.id, {
        id: randomUUID(),
        kind: "chat",
        createdAt: new Date().toISOString(),
        previewText: buildQueuedComposerPreviewText({
          trimmedPrompt: trimmed,
          images: queuedImagesForPersistence,
          files: composerFilesForSend,
          assistantSelections: composerAssistantSelectionsForSend,
          browserAnnotations: composerBrowserAnnotationsForSend,
          terminalContexts: sendableComposerTerminalContexts,
          fileComments: composerFileCommentsForSend,
          pastedTexts: sendableComposerPastedTexts,
        }),
        prompt: promptForSend,
        images: queuedImagesForPersistence,
        files: composerFilesForSend,
        assistantSelections: composerAssistantSelectionsForSend,
        browserAnnotations: composerBrowserAnnotationsForSend,
        fileComments: composerFileCommentsForSend,
        terminalContexts: sendableComposerTerminalContexts,
        pastedTexts: sendableComposerPastedTexts,
        skills: selectedComposerSkillsForSend,
        mentions: selectedComposerMentionsForSend,
        selectedProvider: selectedProviderForSend,
        selectedModel: selectedModelForSend,
        selectedPromptEffort: selectedPromptEffortForSend,
        modelSelection: selectedModelSelectionForSend,
        ...(providerOptionsForDispatchForSend
          ? { providerOptionsForDispatch: providerOptionsForDispatchForSend }
          : {}),
        ...(sourceProposedPlanForSend ? { sourceProposedPlan: sourceProposedPlanForSend } : {}),
        runtimeMode: runtimeModeForSend,
        interactionMode: interactionModeForSend,
        ...(makeNoMistakeLevelForSend > 0 ? { makeNoMistakeLevel: makeNoMistakeLevelForSend } : {}),
        envMode: envModeForSend,
      });
      return true;
    }
    const threadIdForSend = activeThread.id;
    const isFirstMessage = !isServerThread || !hasNativeUserMessages;
    const firstSendCreatedAt = new Date();
    let firstComposerImageNameForTitle: string | null = null;
    if (composerImagesForSend.length > 0) {
      firstComposerImageNameForTitle = composerImagesForSend[0]?.name ?? null;
    }
    let titleSeed = trimmedPromptForSend;
    if (!titleSeed) {
      if (firstComposerImageNameForTitle) {
        titleSeed = `Image: ${firstComposerImageNameForTitle}`;
      } else if (composerFilesForSend.length > 0) {
        titleSeed = `File: ${composerFilesForSend[0]?.name ?? "attachment"}`;
      } else if (composerAssistantSelectionsForSend.length > 0) {
        titleSeed = formatAssistantSelectionTitleSeed(composerAssistantSelectionsForSend.length);
      } else if (composerBrowserAnnotationsForSend.length > 0) {
        titleSeed = formatBrowserAnnotationLabel(composerBrowserAnnotationsForSend[0]!);
      } else if (sendableComposerTerminalContexts.length > 0) {
        titleSeed = formatTerminalContextLabel(sendableComposerTerminalContexts[0]!);
      } else if (composerFileCommentsForSend.length > 0) {
        titleSeed = formatFileCommentTitleSeed(composerFileCommentsForSend.length);
      } else if (sendableComposerPastedTexts.length > 0) {
        titleSeed =
          formatPastedTextTitleSeed(sendableComposerPastedTexts) ?? GENERIC_CHAT_THREAD_TITLE;
      } else {
        titleSeed = GENERIC_CHAT_THREAD_TITLE;
      }
    }
    // Keep the optimistic label short while the server asks Codex for a better summary.
    const title = buildPromptThreadTitleFallback(titleSeed);
    const currentStoreState = useStore.getState();
    // Keep an optimistically selected Space across the command/snapshot race. The server
    // validates this best-effort target and degrades genuinely stale/deleted ids to Void.
    const activeSpaceIdForSend = readActiveSpaceId();
    const firstSendTarget = resolveFirstSendTarget({
      activeProject,
      chatWorkspaceRoot,
      createdAt: firstSendCreatedAt,
      isFirstMessage,
      isHomeChatContainer,
      isStudioContainer,
      projects: currentStoreState.projects,
      // Studio reference folders change the thread cwd without moving the chat out of
      // the managed Studio project. Home-chat folder selection keeps its project routing.
      selectedWorkspaceRoot: isHomeChatContainer ? (resolvedThreadWorktreePath ?? null) : null,
      title,
      titleSeed,
    });
    let {
      targetProjectId: targetProjectIdForSend,
      targetProjectKind: targetProjectKindForSend,
      targetProjectCwd: targetProjectCwdForSend,
      targetProjectScripts: targetProjectScriptsForSend,
      targetProjectDefaultModelSelection: targetProjectDefaultModelSelectionForSend,
    } = firstSendTarget.kind === "create-project"
      ? {
          targetProjectId: activeProject.id,
          targetProjectKind: activeProject.kind,
          targetProjectCwd: activeProject.cwd,
          targetProjectScripts: activeProject.kind === "project" ? activeProject.scripts : [],
          targetProjectDefaultModelSelection: activeProject.defaultModelSelection ?? null,
        }
      : firstSendTarget.target;
    let nextRuntimeModeForSend = runtimeModeForSend;
    let nextThreadEnvMode = envModeForSend;
    let nextThreadBranch = isStudioContainer ? null : activeThread.branch;
    let nextThreadWorktreePath = isStudioContainer ? null : activeThread.worktreePath;
    let nextThreadWorkingDirectory = isStudioContainer
      ? resolvedThreadWorkingDirectory
      : (activeThread.workingDirectory ?? null);
    let nextAssociatedWorktreePath = isStudioContainer
      ? null
      : (activeThread.associatedWorktreePath ?? null);
    let nextAssociatedWorktreeBranch = isStudioContainer
      ? null
      : (activeThread.associatedWorktreeBranch ?? null);
    let nextAssociatedWorktreeRef = isStudioContainer
      ? null
      : (activeThread.associatedWorktreeRef ?? null);
    const shouldResumeSettledLocalThread =
      isServerThread &&
      activeThread.settledAt != null &&
      nextThreadEnvMode === "local" &&
      nextThreadWorktreePath === null;
    let currentActiveGitBranchForSend = currentActiveGitBranch;

    if (isFirstMessage && isContainerLandingProject && firstSendTarget.kind !== "current") {
      if (firstSendTarget.kind === "create-project") {
        const projectId = newProjectId();
        const createdAt = firstSendCreatedAt.toISOString();
        // Managed chat rows stay global; a folder mention creates an ordinary project and
        // should inherit the Space where the first send originated. Resolved before the
        // `try`: a value block inside a try body makes React Compiler bail out on the whole
        // component.
        const createProjectSpaceFields =
          firstSendTarget.creation.kind === "project" ? { spaceId: activeSpaceIdForSend } : {};
        try {
          await api.orchestration.dispatchCommand({
            type: "project.create",
            commandId: newCommandId(),
            projectId,
            kind: firstSendTarget.creation.kind,
            title: firstSendTarget.creation.title,
            workspaceRoot: firstSendTarget.creation.workspaceRoot,
            createWorkspaceRootIfMissing: firstSendTarget.creation.createWorkspaceRootIfMissing,
            defaultModelSelection: firstSendTarget.creation.defaultModelSelection,
            ...createProjectSpaceFields,
            createdAt,
          });
          targetProjectIdForSend = projectId;
          targetProjectKindForSend = firstSendTarget.creation.kind;
          targetProjectCwdForSend = firstSendTarget.creation.workspaceRoot;
          targetProjectScriptsForSend = [];
          targetProjectDefaultModelSelectionForSend =
            firstSendTarget.creation.defaultModelSelection;
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "Failed to create the selected project.";
          if (!isDuplicateProjectCreateError(description)) {
            throw error;
          }

          // If the server already knows this workspace root, reuse that project and continue.
          const { snapshot, project: recoveredProject } =
            await waitForRecoverableProjectForDuplicateCreate({
              message: description,
              workspaceRoot: firstSendTarget.creation.workspaceRoot,
              loadSnapshot: () => api.orchestration.getShellSnapshot().catch(() => null),
            });
          if (!snapshot || !recoveredProject) {
            throw error;
          }

          syncServerShellSnapshot(snapshot);
          targetProjectIdForSend = recoveredProject.id;
          targetProjectKindForSend = recoveredProject.kind ?? firstSendTarget.creation.kind;
          targetProjectCwdForSend = recoveredProject.workspaceRoot;
          targetProjectScriptsForSend =
            (recoveredProject.kind ?? firstSendTarget.creation.kind) === "project"
              ? [...recoveredProject.scripts]
              : [];
          targetProjectDefaultModelSelectionForSend =
            recoveredProject.defaultModelSelection ??
            firstSendTarget.creation.defaultModelSelection;
        }
      }

      clearProjectDraftThreadId(targetProjectIdForSend);
      setDraftThreadContext(threadIdForSend, {
        projectId: targetProjectIdForSend,
        envMode: "local",
        worktreePath: null,
        workingDirectory: null,
        branch: null,
      });
      nextThreadEnvMode = "local";
      nextThreadBranch = null;
      nextThreadWorktreePath = null;
      nextThreadWorkingDirectory = null;
      nextAssociatedWorktreePath = null;
      nextAssociatedWorktreeBranch = null;
      nextAssociatedWorktreeRef = null;
    }

    // The branch query can finish just after the user chooses New worktree. Use the
    // resolved active branch at send time instead of rejecting an otherwise valid fast send.
    if (
      isFirstMessage &&
      nextThreadEnvMode === "worktree" &&
      !nextThreadWorktreePath &&
      !nextThreadBranch
    ) {
      nextThreadBranch = activeRootBranch ?? null;
    }

    // A settled local thread keeps its historical branch until the user resumes it, so the
    // composer can explain the branch change. Refresh Git status before sending because the
    // cached branch query may still be loading or may lag behind an out-of-band checkout.
    if (shouldResumeSettledLocalThread) {
      if (!gitBranchSourceCwd) {
        setStoreThreadError(threadIdForSend, "Unable to determine the current branch.");
        return false;
      }

      try {
        const gitStatus = await queryClient.fetchQuery({
          ...gitStatusQueryOptions(gitBranchSourceCwd),
          staleTime: 0,
        });
        currentActiveGitBranchForSend = gitStatus.branch;
      } catch {
        setStoreThreadError(
          threadIdForSend,
          "Unable to determine the current branch. Try again before sending.",
        );
        return false;
      }

      if (currentActiveGitBranchForSend !== null) {
        nextThreadBranch = currentActiveGitBranchForSend;
      } else {
        nextThreadBranch = null;
      }
    }

    const baseBranchForWorktree =
      isFirstMessage && nextThreadEnvMode === "worktree" && !nextThreadWorktreePath
        ? nextThreadBranch
        : null;

    // In worktree mode, require an explicit base branch so we don't silently
    // fall back to local execution when branch selection is missing.
    const shouldCreateWorktree =
      isFirstMessage && nextThreadEnvMode === "worktree" && !nextThreadWorktreePath;
    if (shouldCreateWorktree && !nextThreadBranch) {
      setStoreThreadError(
        threadIdForSend,
        "Select a base branch before sending in New worktree mode.",
      );
      return false;
    }

    const setupScriptForWorktree = baseBranchForWorktree
      ? setupProjectScript(targetProjectScriptsForSend)
      : null;
    const worktreeSetupScriptName = setupScriptForWorktree?.name ?? null;
    // Branching off the checkout's current branch also carries its uncommitted
    // changes into the worktree, which the setup card surfaces as its own step.
    const worktreeCopiesLocalChanges =
      Boolean(baseBranchForWorktree) && baseBranchForWorktree === activeRootBranch;
    const messageIdForSend = newMessageId();
    const worktreeSetupResolution = baseBranchForWorktree ? createWorktreeSetupResolution() : null;
    worktreeSetupResolutionRef.current = worktreeSetupResolution;
    if (worktreeSetupResolution) {
      setWorktreeSetupPendingAction(null);
    }

    sendInFlightRef.current = true;
    beginLocalDispatch({
      expectedUserMessageId: messageIdForSend,
      ...(baseBranchForWorktree
        ? {
            worktreeSetupStepId: "create-branch" as const,
            setupScriptName: worktreeSetupScriptName,
            copyLocalChanges: worktreeCopiesLocalChanges,
          }
        : {}),
    });

    const composerImagesSnapshot = [...composerImagesForSend];
    const composerFilesSnapshot = [...composerFilesForSend];
    const composerAssistantSelectionsSnapshot = [...composerAssistantSelectionsForSend];
    const composerBrowserAnnotationsSnapshot = composerBrowserAnnotationsForSend.map(
      (annotation) => ({ ...annotation, source: { ...annotation.source } }),
    );
    const composerFileCommentsSnapshot = [...composerFileCommentsForSend];
    const composerTerminalContextsSnapshot = [...sendableComposerTerminalContexts];
    const composerPastedTextsSnapshot = [...sendableComposerPastedTexts];
    const composerSkillsSnapshot = [...selectedComposerSkillsForSend];
    const composerMentionsSnapshot = [...selectedComposerMentionsForSend];
    // Trailing blocks are appended innermost-to-outermost: assistant selections,
    // terminal contexts, file comments, pasted text, then browser annotations
    // (outermost). The display
    // extractors unwrap them in the reverse order.
    const messageTextForSend = appendBrowserAnnotationsToPrompt(
      appendPastedTextsToPrompt(
        appendFileCommentsToPrompt(
          appendTerminalContextsToPrompt(
            appendAssistantSelectionsToPrompt(promptForSend, composerAssistantSelectionsSnapshot),
            composerTerminalContextsSnapshot,
          ),
          composerFileCommentsSnapshot,
        ),
        composerPastedTextsSnapshot,
      ),
      composerBrowserAnnotationsSnapshot,
      messageIdForSend,
    );
    const messageCreatedAt = new Date().toISOString();
    const outgoingTextSeed =
      messageTextForSend || (composerImagesSnapshot.length > 0 ? IMAGE_ONLY_BOOTSTRAP_PROMPT : "");
    const outgoingMessageText = formatOutgoingComposerPrompt({
      provider: selectedProviderForSend,
      model: selectedModelForSend,
      effort: selectedPromptEffortForSend,
      text: outgoingTextSeed,
    });
    const mentionedSkillsForSend = filterPromptSkillReferences(
      outgoingMessageText,
      selectedComposerSkillsForSend,
      selectedProviderForSend,
    );
    const mentionedPluginMentionsForSend = filterPromptProviderMentionReferences(
      outgoingMessageText,
      selectedComposerMentionsForSend,
    );
    const turnAttachmentsPromise = stageUploadComposerAttachments({
      threadId: threadIdForSend,
      images: composerImagesSnapshot,
      files: composerFilesSnapshot,
      assistantSelections: composerAssistantSelectionsSnapshot,
    });
    const optimisticAttachments = [
      ...composerAssistantSelectionsSnapshot,
      ...composerImagesSnapshot.map((image) => ({
        type: "image" as const,
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        previewUrl: image.previewUrl,
      })),
      ...composerFilesSnapshot.map((file) => ({
        type: "file" as const,
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      })),
    ];
    // Sending the first message flips the centered empty landing into a normal
    // transcript. Clear session-only landing overrides when default-open is enabled;
    // otherwise keep the transition closed.
    if (isCenteredEmptyLanding) {
      setEnvironmentPanelPreferenceOpen(
        resolveEnvironmentPanelPreferenceAfterFirstSend({
          isCenteredEmptyLanding,
          settingsDefaultOpen: settings.environmentPanelDefaultOpen,
          currentPreferenceOpen: environmentPanelPreferenceOpen,
        }),
      );
    }
    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        dispatchMode,
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        ...(mentionedSkillsForSend.length > 0 ? { skills: mentionedSkillsForSend } : {}),
        ...(mentionedPluginMentionsForSend.length > 0
          ? { mentions: mentionedPluginMentionsForSend }
          : {}),
        createdAt: messageCreatedAt,
        streaming: false,
        source: "native",
      },
    ]);
    // Mark the transcript as anchored before the optimistic row lands. The tail
    // anchor sizes the spacer that lets this message sit at the viewport top,
    // and its hook owns the slide; auto-follow stays armed for bookkeeping but
    // pauses until the in-flight flag clears.
    armTranscriptAutoFollow(threadIdForSend, true);
    tailAnchorScrollInFlightRef.current = true;
    setTailAnchor({ threadId: threadIdForSend, messageId: messageIdForSend });

    setThreadError(threadIdForSend, null);
    if (expiredTerminalContextCount > 0) {
      const toastCopy = buildExpiredTerminalContextToastCopy(
        expiredTerminalContextCount,
        "omitted",
      );
      toastManager.add({
        type: "warning",
        title: toastCopy.title,
        description: toastCopy.description,
      });
    }
    // Queued turns are dispatched from their captured snapshot, so this send path
    // must not clear a separate live draft the user may already be editing.
    if (queuedChatTurn === null) {
      promptHistoryNavigationRef.current = null;
      applyingPromptHistoryNavigationRef.current = false;
      expectedPromptHistoryPromptRef.current = null;
      promptRef.current = "";
      clearComposerDraftContent(threadIdForSend, { preservePreviewUrls: true });
      if (isLivePlanFollowUpSubmission) {
        setComposerDraftInteractionMode(threadIdForSend, interactionModeForSend);
      }
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);
      // A clicked submit button steals focus; return it after the controlled
      // draft reset so rapid follow-up typing lands in the composer.
      scheduleComposerFocus();
    }

    let createdServerThreadForLocalDraft = false;
    let createdWorktreeForSendPath: string | null = null;
    let switchedToLocalCheckout = false;
    let turnStartSucceeded = false;
    let settledLocalBranchUpdatedForSend = false;
    await (async () => {
      // "Work locally" from the setup card: drop any prepared worktree and
      // point the send (and the thread's metadata) back at the project
      // checkout. Awaited before the turn dispatch so the session resolves the
      // local cwd instead of the abandoned worktree.
      const applyWorkLocallySwitch = async () => {
        switchedToLocalCheckout = true;
        nextThreadEnvMode = "local";
        nextThreadBranch = null;
        nextThreadWorktreePath = null;
        nextAssociatedWorktreePath = null;
        nextAssociatedWorktreeBranch = null;
        nextAssociatedWorktreeRef = null;
        const worktreePathToRemove = createdWorktreeForSendPath;
        createdWorktreeForSendPath = null;
        if (worktreePathToRemove) {
          // Best-effort: a leftover worktree is inert and reclaimable later.
          void api.git
            .removeWorktree({
              cwd: targetProjectCwdForSend,
              path: worktreePathToRemove,
              force: true,
              reclaimTemporaryBranch: true,
            })
            .catch(() => undefined);
        }
        if (isServerThread || createdServerThreadForLocalDraft) {
          await api.orchestration.dispatchCommand({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            envMode: "local",
            branch: null,
            worktreePath: null,
            associatedWorktreePath: null,
            associatedWorktreeBranch: null,
            associatedWorktreeRef: null,
          });
          setStoreThreadWorkspace(threadIdForSend, {
            envMode: "local",
            branch: null,
            worktreePath: null,
            associatedWorktreePath: null,
            associatedWorktreeBranch: null,
            associatedWorktreeRef: null,
          });
        }
        clearLocalDispatchWorktreeSetup();
      };

      // Honors a Cancel / Work locally choice at a step boundary. Cancel
      // unwinds through the shared send-failure path below; the cancelled
      // sentinel keeps that path from painting error state.
      const consumeWorktreeSetupResolution = async () => {
        const action = worktreeSetupResolution?.action ?? null;
        if (action === null || switchedToLocalCheckout) {
          return;
        }
        if (action === "cancel") {
          throw new WorktreeSetupCancelledError();
        }
        await applyWorkLocallySwitch();
      };

      // On first message: lock in branch + create worktree if needed.
      if (baseBranchForWorktree && worktreeSetupResolution) {
        // The server streams each real setup phase (branch → worktree → copy
        // changes); advance the card's rows from those events instead of
        // letting one row spin through the whole creation.
        const worktreeProgressId = randomUUID();
        const creationFlow = await runWorktreeCreationFlow({
          progressId: worktreeProgressId,
          subscribeToProgress: (listener) => api.git.onWorktreeSetupProgress(listener),
          startCreation: () =>
            createWorktreeMutation.mutateAsync({
              cwd: targetProjectCwdForSend,
              ref: baseBranchForWorktree,
              newBranch: buildTemporaryWorktreeBranchName(),
              progressId: worktreeProgressId,
              ...(worktreeCopiesLocalChanges ? { copyChangesFrom: targetProjectCwdForSend } : {}),
            }),
          resolution: worktreeSetupResolution,
          onCreationStep: (stepId) =>
            beginLocalDispatch({
              worktreeSetupStepId: stepId,
              setupScriptName: worktreeSetupScriptName,
              copyLocalChanges: worktreeCopiesLocalChanges,
            }),
          removeWorktree: (worktreePath) =>
            api.git.removeWorktree({
              cwd: targetProjectCwdForSend,
              path: worktreePath,
              force: true,
              reclaimTemporaryBranch: true,
            }),
        });
        if (creationFlow.outcome === "resolved") {
          await consumeWorktreeSetupResolution();
        } else {
          const result = creationFlow.result;
          beginLocalDispatch({
            worktreeSetupStepId: "prepare-thread",
            setupScriptName: worktreeSetupScriptName,
            copyLocalChanges: worktreeCopiesLocalChanges,
          });
          nextThreadBranch = result.worktree.branch;
          nextThreadWorktreePath = result.worktree.path;
          createdWorktreeForSendPath = result.worktree.path;
          const nextAssociatedWorktree = {
            associatedWorktreePath: result.worktree.path,
            associatedWorktreeBranch: result.worktree.branch,
            associatedWorktreeRef: result.worktree.ref,
          };
          nextAssociatedWorktreePath = nextAssociatedWorktree.associatedWorktreePath;
          nextAssociatedWorktreeBranch = nextAssociatedWorktree.associatedWorktreeBranch;
          nextAssociatedWorktreeRef = nextAssociatedWorktree.associatedWorktreeRef;
          if (isServerThread) {
            await api.orchestration.dispatchCommand({
              type: "thread.meta.update",
              commandId: newCommandId(),
              threadId: threadIdForSend,
              envMode: "worktree",
              branch: result.worktree.branch,
              worktreePath: result.worktree.path,
              associatedWorktreePath: nextAssociatedWorktree.associatedWorktreePath,
              associatedWorktreeBranch: nextAssociatedWorktree.associatedWorktreeBranch,
              associatedWorktreeRef: nextAssociatedWorktree.associatedWorktreeRef,
            });
            // Keep local thread state in sync immediately so terminal drawer opens
            // with the worktree cwd/env instead of briefly using the project root.
            setStoreThreadWorkspace(threadIdForSend, {
              branch: result.worktree.branch,
              worktreePath: result.worktree.path,
              ...nextAssociatedWorktree,
            });
          }
        }
      }

      const threadCreateModelSelection: ModelSelection = buildModelSelection(
        selectedModelSelectionForSend.provider,
        selectedModelSelectionForSend.model ||
          selectedModelForSend ||
          targetProjectDefaultModelSelectionForSend?.model ||
          DEFAULT_MODEL_BY_PROVIDER.codex,
        selectedModelSelectionForSend.options,
        selectedModelSelectionForSend.provider === "claudeAgent"
          ? selectedModelSelectionForSend.supportsAutoMode
          : undefined,
      );

      if (isLocalDraftThread) {
        const inheritedProjectInstructions =
          useProjectInstructionsStore.getState().instructionsByProjectId[targetProjectIdForSend] ??
          "";
        const inheritedThreadNotes = mergeProjectInstructionsIntoThreadNotes({
          threadNotes,
          projectInstructions: inheritedProjectInstructions,
        });
        await promoteThreadCreate(
          {
            type: "thread.create",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            projectId: targetProjectIdForSend,
            title,
            modelSelection: threadCreateModelSelection,
            runtimeMode: nextRuntimeModeForSend,
            interactionMode: interactionModeForSend,
            envMode: nextThreadEnvMode,
            branch: nextThreadBranch,
            worktreePath: nextThreadWorktreePath,
            workingDirectory: nextThreadWorkingDirectory,
            associatedWorktreePath: nextAssociatedWorktreePath,
            associatedWorktreeBranch: nextAssociatedWorktreeBranch,
            associatedWorktreeRef: nextAssociatedWorktreeRef,
            lastKnownPr: activeThread.lastKnownPr ?? null,
            createdAt: activeThread.createdAt,
          },
          api,
        );
        // `thread.create` does not carry notes, so seed the freshly created
        // server thread's notepad with the inherited project instructions via a
        // dedicated meta update. Best-effort: a failure here must not abort the turn.
        if (inheritedThreadNotes !== threadNotes && inheritedThreadNotes.trim().length > 0) {
          try {
            await dispatchThreadNotes(threadIdForSend, inheritedThreadNotes);
          } catch {
            // Seeding is non-critical; project instructions can still be copied
            // into the notepad manually from the Environment panel.
          }
        }
        // Same for a goal staged on the draft via /goal: persist it now so the
        // decider stamps goalStartedAt when the thread actually starts working.
        const draftGoalForSend = activeThread.goal?.trim() ?? "";
        if (draftGoalForSend.length > 0) {
          try {
            await dispatchThreadGoal(threadIdForSend, draftGoalForSend, {
              startBehavior: "defer",
            });
          } catch {
            // Non-critical: the goal can be set again with /goal on the live thread.
          }
        }
        if (targetProjectKindForSend === "chat") {
          await api.orchestration.dispatchCommand({
            type: "project.meta.update",
            commandId: newCommandId(),
            projectId: targetProjectIdForSend,
            title,
          });
        }
        createdServerThreadForLocalDraft = true;
      }

      const setupScript = switchedToLocalCheckout ? null : setupScriptForWorktree;
      if (setupScript) {
        let shouldRunSetupScript = false;
        if (isServerThread) {
          shouldRunSetupScript = true;
        } else {
          if (createdServerThreadForLocalDraft) {
            shouldRunSetupScript = true;
          }
        }
        if (shouldRunSetupScript) {
          beginLocalDispatch({
            worktreeSetupStepId: "run-setup-action",
            setupScriptName: setupScript.name,
            copyLocalChanges: worktreeCopiesLocalChanges,
          });
          const setupScriptOptions: Parameters<typeof runProjectScript>[1] = {
            worktreePath: nextThreadWorktreePath,
            rememberAsLastInvoked: false,
            throwOnError: true,
          };
          if (nextThreadWorktreePath) {
            setupScriptOptions.cwd = nextThreadWorktreePath;
          }
          const setupTerminal = await runProjectScript(setupScript, setupScriptOptions);
          if (setupTerminal) {
            const setupActivityAbortController = new AbortController();
            const setupActivityWait = waitForSetupScriptTerminalActivity({
              threadId: threadIdForSend,
              terminalId: setupTerminal.terminalId,
              signal: setupActivityAbortController.signal,
            });
            // Setup scripts can run for minutes; let Cancel / Work locally win
            // the wait. The script itself keeps running — a cancelled worktree
            // is force-removed, a local switch just stops waiting on it.
            await (
              worktreeSetupResolution
                ? Promise.race([setupActivityWait, worktreeSetupResolution.promise])
                : setupActivityWait
            ).finally(() => setupActivityAbortController.abort());
          }
        }
      }
      // Covers a resolution set while the thread was linked or the setup
      // script ran (the creation-step race above only guards the first step).
      await consumeWorktreeSetupResolution();

      if (isServerThread) {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          modelSelection: selectedModelSelectionForSend,
          runtimeMode: nextRuntimeModeForSend,
          interactionMode: interactionModeForSend,
        });
      }

      const stagedTurnAttachments = await turnAttachmentsPromise;

      if (
        isServerThread &&
        activeThread.settledAt != null &&
        nextThreadEnvMode === "local" &&
        nextThreadWorktreePath === null &&
        nextThreadBranch !== activeThread.branch
      ) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          envMode: "local",
          branch: nextThreadBranch,
          worktreePath: null,
          associatedWorktreePath: nextAssociatedWorktreePath,
          associatedWorktreeBranch: nextAssociatedWorktreeBranch,
          associatedWorktreeRef: nextAssociatedWorktreeRef,
        });
        settledLocalBranchUpdatedForSend = true;
        setStoreThreadWorkspace(threadIdForSend, {
          envMode: "local",
          branch: nextThreadBranch,
          worktreePath: null,
          associatedWorktreePath: nextAssociatedWorktreePath,
          associatedWorktreeBranch: nextAssociatedWorktreeBranch,
          associatedWorktreeRef: nextAssociatedWorktreeRef,
        });
      }
      // Keep setup resolvable while attachment uploads are still preparing the
      // turn. Once they settle, consume the last possible choice before the
      // card advances to the non-resolvable "Starting session" step.
      await consumeWorktreeSetupResolution();
      // Carry the expected message id so a snapshot rebuilt after an interim
      // reset (thread switch, ack effect) keeps the message-echo ack signal.
      beginLocalDispatch({
        expectedUserMessageId: messageIdForSend,
        ...(baseBranchForWorktree && !switchedToLocalCheckout
          ? {
              worktreeSetupStepId: "start-session" as const,
              setupScriptName: worktreeSetupScriptName,
              copyLocalChanges: worktreeCopiesLocalChanges,
            }
          : {}),
      });
      rememberCustomBinaryPathForDispatch({
        threadId: threadIdForSend,
        provider: selectedModelSelectionForSend.provider,
        providerOptions: providerOptionsForDispatchForSend,
      });
      await stagedTurnAttachments.runWithDispatch((turnAttachments) =>
        api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: outgoingMessageText,
            attachments: turnAttachments,
            ...(mentionedSkillsForSend.length > 0 ? { skills: mentionedSkillsForSend } : {}),
            ...(mentionedPluginMentionsForSend.length > 0
              ? { mentions: mentionedPluginMentionsForSend }
              : {}),
          },
          modelSelection: selectedModelSelectionForSend,
          ...(providerOptionsForDispatchForSend
            ? { providerOptions: providerOptionsForDispatchForSend }
            : {}),
          assistantDeliveryMode,
          dispatchMode,
          runtimeMode: nextRuntimeModeForSend,
          interactionMode: interactionModeForSend,
          ...(responseModifiersForSend ? { responseModifiers: responseModifiersForSend } : {}),
          ...(sourceProposedPlanForSend ? { sourceProposedPlan: sourceProposedPlanForSend } : {}),
          createdAt: messageCreatedAt,
        }),
      );
      turnStartSucceeded = true;
      if (
        shouldResumeSettledLocalThread &&
        currentActiveGitBranchForSend !== null &&
        nextThreadBranch === currentActiveGitBranchForSend
      ) {
        setSettledThreadBranchWarningDismissedThreadId(threadIdForSend);
      }
      armLocalDispatchAckFallback(threadIdForSend);
      // Steers on providers without native mid-turn steering interrupt the live
      // turn before re-dispatching; hold queued auto-dispatch through that gap
      // so it can't race the steer. The live session provider decides the
      // interrupt path server-side, so the gate keys off it rather than the
      // requested model selection.
      const liveProviderForSteerGate =
        activeThread?.session?.provider ?? selectedModelSelectionForSend.provider;
      if (
        dispatchMode === "steer" &&
        !providerSupportsNativeTurnSteering(liveProviderForSteerGate)
      ) {
        const nextSteerGate = {
          sawInterruptGap: false,
          gapStartedAt: null,
          armedActiveTurnId: activeThread?.session?.activeTurnId ?? null,
        };
        setQueuedSteerGate(nextSteerGate);
        armQueuedComposerSteerGate(threadId, nextSteerGate);
      }
      if (sourceProposedPlanForSend) {
        planSidebarDismissedForTurnRef.current = null;
        setPlanSidebarOpen(true);
      }
      if (queuedChatTurn === null) {
        setRestoredQueuedSourceProposedPlan(threadIdForSend, null);
      }
    })().catch(async (err: unknown) => {
      // A user-cancelled worktree setup unwinds through this same rollback,
      // but silently: no error styling on the step row, no thread error.
      const setupCancelled = err instanceof WorktreeSetupCancelledError;
      // Uploads start in parallel with workspace/session preparation. If any
      // earlier step fails, settle that promise and release every staged blob.
      await turnAttachmentsPromise.then(
        (staged) => staged.cleanup(),
        () => undefined,
      );
      // Surface the failure on whichever setup step was active (no-op for
      // sends without a worktree setup in flight).
      if (!setupCancelled) {
        failLocalDispatchWorktreeSetup();
      }
      if (!turnStartSucceeded) {
        // The turn RPC never resolved, so no server turn exists for the
        // watchdog to recover — drop the marker armed when the dispatch began.
        clearPendingTurnDispatch(threadIdForSend);
      }
      if (settledLocalBranchUpdatedForSend && !turnStartSucceeded) {
        await api.orchestration
          .dispatchCommand({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            envMode: "local",
            branch: activeThread.branch,
            worktreePath: null,
            associatedWorktreePath: activeThread.associatedWorktreePath ?? null,
            associatedWorktreeBranch: activeThread.associatedWorktreeBranch ?? null,
            associatedWorktreeRef: activeThread.associatedWorktreeRef ?? null,
          })
          .then(
            () =>
              setStoreThreadWorkspace(threadIdForSend, {
                envMode: "local",
                branch: activeThread.branch,
                worktreePath: null,
                associatedWorktreePath: activeThread.associatedWorktreePath ?? null,
                associatedWorktreeBranch: activeThread.associatedWorktreeBranch ?? null,
                associatedWorktreeRef: activeThread.associatedWorktreeRef ?? null,
              }),
            () => undefined,
          );
      }
      if (createdServerThreadForLocalDraft && !turnStartSucceeded) {
        // This rollback cleans up a retryable draft promotion; do not tombstone the draft id.
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: threadIdForSend,
          })
          .catch(() => undefined);
      }
      if (createdWorktreeForSendPath && !turnStartSucceeded) {
        const removed = await api.git
          .removeWorktree({
            cwd: targetProjectCwdForSend,
            path: createdWorktreeForSendPath,
            force: true,
            reclaimTemporaryBranch: true,
          })
          .then(
            () => true,
            () => false,
          );
        if (removed && isServerThread) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.meta.update",
              commandId: newCommandId(),
              threadId: threadIdForSend,
              envMode: "local",
              branch: null,
              worktreePath: null,
              associatedWorktreePath: null,
              associatedWorktreeBranch: null,
              associatedWorktreeRef: null,
            })
            .then(
              () =>
                setStoreThreadWorkspace(threadIdForSend, {
                  branch: null,
                  worktreePath: null,
                  associatedWorktreePath: null,
                  associatedWorktreeBranch: null,
                  associatedWorktreeRef: null,
                }),
              () => undefined,
            );
        }
      }
      if (
        queuedChatTurn === null &&
        !turnStartSucceeded &&
        promptRef.current.length === 0 &&
        composerImagesRef.current.length === 0 &&
        composerFilesRef.current.length === 0 &&
        composerAssistantSelectionsRef.current.length === 0 &&
        composerBrowserAnnotationsRef.current.length === 0 &&
        composerFileCommentsRef.current.length === 0 &&
        composerTerminalContextsRef.current.length === 0 &&
        composerPastedTextsRef.current.length === 0
      ) {
        setOptimisticUserMessages((existing) => {
          const removed = existing.filter((message) => message.id === messageIdForSend);
          for (const message of removed) {
            revokeUserMessagePreviewUrls(message);
          }
          const next = existing.filter((message) => message.id !== messageIdForSend);
          return next.length === existing.length ? existing : next;
        });
        promptRef.current = promptForSend;
        setPrompt(promptForSend);
        setComposerDraftMakeNoMistakeLevel(threadIdForSend, makeNoMistakeLevelForSend);
        if (sourceProposedPlanForSend) {
          setRestoredQueuedSourceProposedPlan(threadIdForSend, {
            threadId: threadIdForSend,
            restoredPrompt: promptForSend,
            sourceProposedPlan: sourceProposedPlanForSend,
          });
        }
        setComposerCursor(collapseExpandedComposerCursor(promptForSend, promptForSend.length));
        addComposerImagesToDraft(composerImagesSnapshot.map(cloneComposerImageAttachment));
        addComposerFilesToDraft(composerFilesSnapshot);
        for (const selection of composerAssistantSelectionsSnapshot) {
          addComposerAssistantSelectionToDraft(selection);
        }
        addComposerDraftBrowserAnnotations(threadIdForSend, composerBrowserAnnotationsSnapshot);
        for (const comment of composerFileCommentsSnapshot) {
          addComposerFileCommentToDraft(comment);
        }
        addComposerTerminalContextsToDraft(composerTerminalContextsSnapshot);
        addComposerPastedTextsToDraft(composerPastedTextsSnapshot);
        updateSelectedComposerSkills(composerSkillsSnapshot);
        updateSelectedComposerMentions(composerMentionsSnapshot);
        setComposerTrigger(detectComposerTrigger(promptForSend, promptForSend.length));
      }
      if (!setupCancelled) {
        setThreadError(
          threadIdForSend,
          err instanceof Error ? err.message : "Failed to send message.",
        );
      }
    });
    sendInFlightRef.current = false;
    worktreeSetupResolutionRef.current = null;
    if (!turnStartSucceeded) {
      if (baseBranchForWorktree && (worktreeSetupResolution?.action ?? null) === null) {
        scheduleFailedWorktreeSetupDispatchReset();
      } else {
        // A resolved setup (cancelled, or switched to local and then failed)
        // has no error step to hold on screen — release the marker directly.
        resetLocalDispatch();
      }
    }
    return turnStartSucceeded;
  };

  const onRespondToApproval = useCallback(
    async (
      requestId: ApprovalRequestId,
      decision: ProviderApprovalDecision,
      lifecycleGeneration?: string,
      requestKind?: ProviderRequestKind,
    ) => {
      const api = readNativeApi();
      if (!api || !activeThreadId) return;
      const requestKey = pendingRequestInstanceKey(requestId, lifecycleGeneration);

      setRespondingRequestKeys((existing) =>
        existing.includes(requestKey) ? existing : [...existing, requestKey],
      );
      // Persist supervised "always allow" client-side so the next turn (after an
      // idle-stop or runtime restart) uses full access. Auto remains the durable
      // thread policy; its server-side override applies only to the live session.
      const durableRuntimeMode = resolveRuntimeModeAfterApprovalDecision(
        runtimeMode,
        decision,
        requestKind,
      );
      if (durableRuntimeMode) {
        setComposerDraftRuntimeMode(activeThreadId, durableRuntimeMode);
      }
      await api.orchestration
        .dispatchCommand({
          type: "thread.approval.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          decision,
          ...(lifecycleGeneration !== undefined ? { lifecycleGeneration } : {}),
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setStoreThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit approval decision.",
          );
        });
      setRespondingRequestKeys((existing) => existing.filter((key) => key !== requestKey));
    },
    [activeThreadId, runtimeMode, setComposerDraftRuntimeMode, setStoreThreadError],
  );

  const onRespondToUserInput = useCallback(
    async (
      requestId: ApprovalRequestId,
      answers: ProviderUserInputAnswers,
      lifecycleGeneration?: string,
    ) => {
      const api = readNativeApi();
      if (!api || !activeThreadId) return;
      const requestKey = pendingRequestInstanceKey(requestId, lifecycleGeneration);
      const dispatchAnswers = hasCompletePendingUserInputAnswers(answers)
        ? answers
        : omitNullPendingUserInputAnswers(answers);

      setRespondingUserInputRequestKeys((existing) =>
        existing.includes(requestKey) ? existing : [...existing, requestKey],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.user-input.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          answers: dispatchAnswers,
          ...(lifecycleGeneration !== undefined ? { lifecycleGeneration } : {}),
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setStoreThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit user input.",
          );
        });
      setRespondingUserInputRequestKeys((existing) => existing.filter((key) => key !== requestKey));
    },
    [activeThreadId, setStoreThreadError],
  );

  const onCancelActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput || activePendingIsResponding) {
      return;
    }
    promptRef.current = "";
    setPrompt("");
    setComposerCursor(0);
    setComposerTrigger(null);
    void onRespondToUserInput(
      activePendingUserInput.requestId,
      {},
      activePendingUserInput.lifecycleGeneration,
    );
  }, [activePendingIsResponding, activePendingUserInput, onRespondToUserInput, setPrompt]);

  const setActivePendingUserInputQuestionIndex = useCallback(
    (nextQuestionIndex: number) => {
      if (!activePendingUserInputKey) {
        return;
      }
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInputKey]: nextQuestionIndex,
      }));
    },
    [activePendingUserInputKey],
  );

  const onToggleActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput || !activePendingUserInputKey) {
        return null;
      }
      const question = activePendingUserInput.questions.find((entry) => entry.id === questionId);
      if (!question) {
        return null;
      }
      const nextDraftAnswer = togglePendingUserInputOptionSelection(
        question,
        pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey]?.[questionId],
        optionLabel,
      );
      const nextRequestAnswers = {
        ...pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey],
        [questionId]: nextDraftAnswer,
      };
      pendingUserInputAnswersByRequestIdRef.current = {
        ...pendingUserInputAnswersByRequestIdRef.current,
        [activePendingUserInputKey]: nextRequestAnswers,
      };
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInputKey]: nextRequestAnswers,
      }));
      promptRef.current = "";
      setComposerCursor(0);
      setComposerTrigger(null);
      return nextDraftAnswer;
    },
    [activePendingUserInput, activePendingUserInputKey],
  );

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInputKey) {
        return;
      }
      promptRef.current = value;
      const nextDraftAnswer = setPendingUserInputCustomAnswer(
        pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey]?.[questionId],
        value,
      );
      const nextRequestAnswers = {
        ...pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey],
        [questionId]: nextDraftAnswer,
      };
      pendingUserInputAnswersByRequestIdRef.current = {
        ...pendingUserInputAnswersByRequestIdRef.current,
        [activePendingUserInputKey]: nextRequestAnswers,
      };
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInputKey]: nextRequestAnswers,
      }));
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(value, expandedCursor),
      );
    },
    [activePendingUserInputKey],
  );

  const onAdvanceActivePendingUserInput = useCallback(
    (answerOverrides?: Record<string, PendingUserInputDraftAnswer>): boolean => {
      if (!activePendingUserInput || !activePendingUserInputKey || !activePendingProgress) {
        return false;
      }
      const pendingDraftAnswers =
        answerOverrides && Object.keys(answerOverrides).length > 0
          ? {
              ...pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey],
              ...answerOverrides,
            }
          : (pendingUserInputAnswersByRequestIdRef.current[activePendingUserInputKey] ??
            activePendingDraftAnswers);
      if (answerOverrides && Object.keys(answerOverrides).length > 0) {
        pendingUserInputAnswersByRequestIdRef.current = {
          ...pendingUserInputAnswersByRequestIdRef.current,
          [activePendingUserInputKey]: pendingDraftAnswers,
        };
        setPendingUserInputAnswersByRequestId((existing) => ({
          ...existing,
          [activePendingUserInputKey]: pendingDraftAnswers,
        }));
      }
      const resolvedAnswers = buildPendingUserInputAnswers(
        activePendingUserInput.questions,
        pendingDraftAnswers,
      );
      if (activePendingProgress.isLastQuestion) {
        if (resolvedAnswers) {
          void onRespondToUserInput(
            activePendingUserInput.requestId,
            resolvedAnswers,
            activePendingUserInput.lifecycleGeneration,
          );
          return true;
        }
        return false;
      }
      const activeQuestionId = activePendingProgress.activeQuestion?.id ?? null;
      const hasActiveOverride = activeQuestionId
        ? answerOverrides?.[activeQuestionId] !== undefined
        : false;
      if (!activePendingProgress.canAdvance && !hasActiveOverride) {
        return false;
      }
      setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
      return true;
    },
    [
      activePendingDraftAnswers,
      activePendingProgress,
      activePendingUserInput,
      activePendingUserInputKey,
      onRespondToUserInput,
      setActivePendingUserInputQuestionIndex,
    ],
  );

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingProgress) {
      return;
    }
    setActivePendingUserInputQuestionIndex(Math.max(activePendingProgress.questionIndex - 1, 0));
  }, [activePendingProgress, setActivePendingUserInputQuestionIndex]);

  async function onSubmitPlanFollowUp({
    text,
    interactionMode: nextInteractionMode,
    dispatchMode,
    makeNoMistakeLevel: submittedMakeNoMistakeLevel,
    queuedTurn,
  }: {
    text: string;
    interactionMode: "default" | "plan";
    dispatchMode: "queue" | "steer";
    makeNoMistakeLevel?: MakeNoMistakeLevel;
    queuedTurn?: QueuedComposerPlanFollowUp;
  }): Promise<boolean> {
    const api = readNativeApi();
    if (
      !api ||
      !activeThread ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      sendInFlightRef.current
    ) {
      return false;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    const threadIdForSend = activeThread.id;
    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    const outgoingMessageText = formatOutgoingComposerPrompt({
      provider: queuedTurn?.selectedProvider ?? selectedProvider,
      model: queuedTurn?.selectedModel ?? selectedModel,
      effort: queuedTurn?.selectedPromptEffort ?? selectedPromptEffort,
      text: trimmed,
    });
    const makeNoMistakeLevelForSend =
      queuedTurn?.makeNoMistakeLevel ?? submittedMakeNoMistakeLevel ?? 0;
    const responseModifiers = makeNoMistakeResponseModifiers(makeNoMistakeLevelForSend);

    sendInFlightRef.current = true;
    beginLocalDispatch({ expectedUserMessageId: messageIdForSend });
    setThreadError(threadIdForSend, null);
    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        dispatchMode,
        createdAt: messageCreatedAt,
        streaming: false,
        source: "native",
      },
    ]);
    armTranscriptAutoFollow(threadIdForSend, true);
    tailAnchorScrollInFlightRef.current = true;
    setTailAnchor({ threadId: threadIdForSend, messageId: messageIdForSend });

    // Nested function so the `try` body holds no value blocks — see the comment on
    // `deleteEmptyTerminalThread` above for why React Compiler requires this shape.
    const dispatchPlanFollowUpTurn = async () => {
      await persistThreadSettingsForNextTurn({
        threadId: threadIdForSend,
        createdAt: messageCreatedAt,
        modelSelection: queuedTurn?.modelSelection ?? selectedModelSelection,
        runtimeMode: queuedTurn?.runtimeMode ?? runtimeMode,
        interactionMode: nextInteractionMode,
      });

      // Keep the mode toggle and plan-follow-up banner in sync immediately
      // while the same-thread implementation turn is starting.
      setComposerDraftInteractionMode(threadIdForSend, nextInteractionMode);

      const providerOptionsForPlanDispatch =
        queuedTurn?.providerOptionsForDispatch ?? providerOptionsForDispatch;
      const modelSelectionForPlanDispatch = queuedTurn?.modelSelection ?? selectedModelSelection;
      const sourceProposedPlan =
        nextInteractionMode === "default"
          ? buildSourceProposedPlanReference({
              threadId: activeThread.id,
              proposedPlan: activeProposedPlan,
            })
          : undefined;
      rememberCustomBinaryPathForDispatch({
        threadId: threadIdForSend,
        provider: modelSelectionForPlanDispatch.provider,
        providerOptions: providerOptionsForPlanDispatch,
      });
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: threadIdForSend,
        message: {
          messageId: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          attachments: [],
        },
        modelSelection: modelSelectionForPlanDispatch,
        ...(providerOptionsForPlanDispatch
          ? {
              providerOptions: providerOptionsForPlanDispatch,
            }
          : {}),
        assistantDeliveryMode,
        dispatchMode,
        runtimeMode: queuedTurn?.runtimeMode ?? runtimeMode,
        interactionMode: nextInteractionMode,
        ...(responseModifiers ? { responseModifiers } : {}),
        ...(sourceProposedPlan ? { sourceProposedPlan } : {}),
        createdAt: messageCreatedAt,
      });
      // Steers on providers without native mid-turn steering interrupt the live
      // turn before re-dispatching; hold queued auto-dispatch through that gap
      // so it can't race the steer. The live session provider decides the
      // interrupt path server-side, so the gate keys off it rather than the
      // requested model selection.
      const livePlanProviderForSteerGate =
        activeThread?.session?.provider ?? modelSelectionForPlanDispatch.provider;
      if (
        dispatchMode === "steer" &&
        !providerSupportsNativeTurnSteering(livePlanProviderForSteerGate)
      ) {
        const nextSteerGate = {
          sawInterruptGap: false,
          gapStartedAt: null,
          armedActiveTurnId: activeThread?.session?.activeTurnId ?? null,
        };
        setQueuedSteerGate(nextSteerGate);
        armQueuedComposerSteerGate(threadId, nextSteerGate);
      }
      // Optimistically open the plan sidebar when implementing (not refining).
      // "default" mode here means the agent is executing the plan, which produces
      // step-tracking activities that the sidebar will display.
      if (nextInteractionMode === "default") {
        planSidebarDismissedForTurnRef.current = null;
        setPlanSidebarOpen(true);
      }
    };

    try {
      await dispatchPlanFollowUpTurn();
      armLocalDispatchAckFallback(threadIdForSend);
      sendInFlightRef.current = false;
      return true;
    } catch (err) {
      setOptimisticUserMessages((existing) =>
        existing.filter((message) => message.id !== messageIdForSend),
      );
      setThreadError(
        threadIdForSend,
        err instanceof Error ? err.message : "Failed to send plan follow-up.",
      );
      sendInFlightRef.current = false;
      // The turn RPC failed, so no server turn exists for the watchdog to
      // recover — drop the marker armed when the dispatch began.
      clearPendingTurnDispatch(threadIdForSend);
      resetLocalDispatch();
      if (
        queuedTurn === undefined &&
        (useComposerDraftStore.getState().draftsByThreadId[threadIdForSend]?.makeNoMistakeLevel ??
          0) === 0
      ) {
        setComposerDraftMakeNoMistakeLevel(threadIdForSend, makeNoMistakeLevelForSend);
      }
      return false;
    }
  }

  const onEditUserMessage = useCallback(
    async (messageId: MessageId, text: string): Promise<boolean> => {
      const api = readNativeApi();
      if (!api || !activeThread || !isServerThread || isRevertingCheckpoint) {
        return false;
      }
      const editTarget = resolveTailUserMessageEditTarget({
        messages: activeThread.messages,
        messageId,
        activeTurnId:
          activeThread.session?.orchestrationStatus === "running"
            ? (activeThread.session.activeTurnId ?? null)
            : null,
      });
      if (!editTarget.editable) {
        setThreadError(activeThread.id, "Only the latest rollbackable user message can be edited.");
        return false;
      }
      const originalMessage = activeThread.messages[editTarget.messageIndex];
      if (!originalMessage || originalMessage.role !== "user") {
        setThreadError(activeThread.id, "Only the latest rollbackable user message can be edited.");
        return false;
      }
      if (isSendBusy || isConnecting || sendInFlightRef.current) {
        setThreadError(activeThread.id, "Wait for the current send to start before editing.");
        return false;
      }

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      const messageCreatedAt = new Date().toISOString();
      const editedTextWithOriginalContext = appendOriginalComposerPromptBlocks({
        editedPrompt: text,
        originalPrompt: originalMessage.text,
        messageId,
      });
      const outgoingMessageText = formatOutgoingComposerPrompt({
        provider: selectedProvider,
        model: selectedModel,
        effort: selectedPromptEffort,
        text: editedTextWithOriginalContext,
      });
      return await (async () => {
        await persistThreadSettingsForNextTurn({
          threadId: activeThread.id,
          createdAt: messageCreatedAt,
          modelSelection: selectedModelSelection,
          runtimeMode,
          interactionMode,
        });
        await api.orchestration.dispatchCommand({
          type: "thread.message.edit-and-resend",
          commandId: newCommandId(),
          threadId: activeThread.id,
          messageId,
          text: outgoingMessageText,
          modelSelection: selectedModelSelection,
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode,
          runtimeMode,
          interactionMode,
          createdAt: messageCreatedAt,
        });
        return true;
      })()
        .catch((err: unknown) => {
          setThreadError(
            activeThread.id,
            err instanceof Error ? err.message : "Failed to edit message.",
          );
          return false;
        })
        .finally(() => {
          setIsRevertingCheckpoint(false);
        });
    },
    [
      activeThread,
      isConnecting,
      isRevertingCheckpoint,
      isSendBusy,
      isServerThread,
      interactionMode,
      persistThreadSettingsForNextTurn,
      providerOptionsForDispatch,
      runtimeMode,
      selectedModel,
      selectedModelSelection,
      selectedPromptEffort,
      selectedProvider,
      setThreadError,
      assistantDeliveryMode,
    ],
  );

  const dispatchQueuedComposerTurn = useCallback(
    async (queuedTurn: QueuedComposerTurn, dispatchMode: "queue" | "steer"): Promise<boolean> => {
      const lateSendHandlers = lateComposerSendHandlersRef.current;
      if (!lateSendHandlers) {
        return false;
      }
      if (queuedTurn.kind === "chat") {
        return lateSendHandlers.send(undefined, dispatchMode, queuedTurn);
      }
      return lateSendHandlers.submitPlanFollowUp({
        text: queuedTurn.text,
        interactionMode: queuedTurn.interactionMode,
        dispatchMode,
        ...(queuedTurn.makeNoMistakeLevel !== undefined
          ? { makeNoMistakeLevel: queuedTurn.makeNoMistakeLevel }
          : {}),
        queuedTurn,
      });
    },
    [],
  );

  // Resuming a workflow is a normal composer turn instructing the agent to
  // re-invoke the Workflow tool against the persisted script; completed agent()
  // calls replay from cache, so a paused run picks up where it stopped. Sent as
  // a pre-built chat turn so it takes the exact send path a queued turn does.
  const onResumeWorkflowRun = useCallback(async () => {
    if (!workflowRunState?.scriptPath || !workflowRunState.runId) return;
    const lateSendHandlers = lateComposerSendHandlersRef.current;
    if (!lateSendHandlers) return;
    const { workflowTaskId } = workflowRunState;
    const prompt = buildWorkflowResumePrompt(workflowRunState.scriptPath, workflowRunState.runId);
    const sent = await lateSendHandlers.send(undefined, "queue", {
      id: randomUUID(),
      kind: "chat",
      createdAt: new Date().toISOString(),
      previewText: prompt,
      prompt,
      images: [],
      files: [],
      assistantSelections: [],
      browserAnnotations: [],
      terminalContexts: [],
      fileComments: [],
      pastedTexts: [],
      skills: [],
      mentions: [],
      selectedProvider,
      selectedModel,
      selectedPromptEffort,
      modelSelection: selectedModelSelection,
      ...(providerOptionsForDispatch ? { providerOptionsForDispatch } : {}),
      runtimeMode,
      interactionMode,
      envMode,
    });
    if (sent && activeThreadId) {
      markWorkflowRunDismissed(activeThreadId, workflowTaskId);
    }
  }, [
    activeThreadId,
    envMode,
    interactionMode,
    markWorkflowRunDismissed,
    providerOptionsForDispatch,
    runtimeMode,
    selectedModel,
    selectedModelSelection,
    selectedPromptEffort,
    selectedProvider,
    workflowRunState,
  ]);

  const onSteerQueuedComposerTurn = useCallback(
    async (queuedTurn: QueuedComposerTurn) => {
      const previousQueue = queuedComposerTurnsRef.current;
      const queuedIndex = previousQueue.findIndex((entry) => entry.id === queuedTurn.id);
      if (queuedIndex < 0) {
        return;
      }
      removeQueuedComposerTurnFromDraft(threadId, queuedTurn.id);
      const succeeded = await dispatchQueuedComposerTurn(queuedTurn, "steer");
      if (succeeded) {
        return;
      }
      insertQueuedComposerTurn(threadId, queuedTurn, queuedIndex);
    },
    [
      dispatchQueuedComposerTurn,
      insertQueuedComposerTurn,
      removeQueuedComposerTurnFromDraft,
      threadId,
    ],
  );

  const onEditQueuedComposerTurn = useCallback(
    (queuedTurn: QueuedComposerTurn) => {
      removeQueuedComposerTurn(queuedTurn.id);
      restoreQueuedTurnToComposer(queuedTurn);
    },
    [removeQueuedComposerTurn, restoreQueuedTurnToComposer],
  );

  // Advance/expire the steer gate as the session moves through the
  // interrupt→steered-turn handoff (or fails out of it).
  const sessionErroredForSteerGate = activeThread?.session?.status === "error";
  const activeTurnIdForSteerGate = activeThread?.session?.activeTurnId ?? null;
  useEffect(() => {
    if (!queuedSteerGate) {
      return;
    }
    const transition = resolveQueuedSteerGateTransition({
      gate: queuedSteerGate,
      phase,
      sessionErrored: sessionErroredForSteerGate,
      activeTurnId: activeTurnIdForSteerGate,
      now: Date.now(),
    });
    if (transition.kind === "clear") {
      setQueuedSteerGate(null);
      clearQueuedComposerSteerGate(threadId);
      return;
    }
    if (
      transition.gate.sawInterruptGap !== queuedSteerGate.sawInterruptGap ||
      transition.gate.gapStartedAt !== queuedSteerGate.gapStartedAt ||
      transition.gate.armedActiveTurnId !== queuedSteerGate.armedActiveTurnId
    ) {
      setQueuedSteerGate(transition.gate);
      armQueuedComposerSteerGate(threadId, transition.gate);
      return;
    }
    if (transition.expiresInMs === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setQueuedSteerGate(null);
      clearQueuedComposerSteerGate(threadId);
    }, transition.expiresInMs);
    return () => window.clearTimeout(timer);
  }, [activeTurnIdForSteerGate, phase, queuedSteerGate, sessionErroredForSteerGate, threadId]);

  useEffect(() => {
    if (
      isQueuedComposerAwaitingTurnStart(threadId) ||
      resolveQueuedComposerAutoDispatchHold({
        localDispatch,
        phase,
        latestTurn: activeLatestTurn,
        session: activeThread?.session ?? null,
        messages: activeThread?.messages ?? EMPTY_MESSAGES,
        isConnecting,
        queuedSteerGate: getQueuedComposerSteerGate(threadId) ?? queuedSteerGate,
        hasPendingApproval: activePendingApproval !== null,
        hasPendingProgress: activePendingProgress !== null,
        hasPendingUserInput: pendingUserInputs.length > 0,
        queuedTurnCount: queuedComposerTurns.length,
        threadError: activeThread?.error,
        now: Date.now(),
      })
    ) {
      return;
    }
    if (
      autoDispatchingQueuedTurnRef.current ||
      sendInFlightRef.current ||
      sendPreflightInFlightRef.current
    ) {
      // These guards are refs, so nothing re-triggers this effect once they
      // reset; poll until the in-flight send settles instead of leaving the
      // queue stuck at the end of a turn.
      const timer = window.setTimeout(() => setQueuedAutoDispatchTick((tick) => tick + 1), 250);
      return () => window.clearTimeout(timer);
    }
    const nextQueuedTurn = queuedComposerTurns[0];
    if (!nextQueuedTurn) {
      return;
    }
    if (!tryBeginQueuedComposerAutoDispatch(threadId)) {
      // The watcher already owns this thread's queue head (background drain
      // started before this ChatView claimed). Poll until that send settles.
      const timer = window.setTimeout(() => setQueuedAutoDispatchTick((tick) => tick + 1), 250);
      return () => window.clearTimeout(timer);
    }
    autoDispatchingQueuedTurnRef.current = true;
    void runLockedQueuedComposerAutoDispatch({
      threadId,
      run: async () => {
        const succeeded = await dispatchQueuedComposerTurn(nextQueuedTurn, "queue");
        if (succeeded) {
          removeQueuedComposerTurnFromDraft(threadId, nextQueuedTurn.id);
        }
      },
      onSettled: () => {
        autoDispatchingQueuedTurnRef.current = false;
      },
    });
  }, [
    activeLatestTurn,
    activePendingApproval,
    activePendingProgress,
    activeThread?.error,
    activeThread?.messages,
    activeThread?.session,
    dispatchQueuedComposerTurn,
    isConnecting,
    localDispatch,
    pendingUserInputs.length,
    phase,
    queuedAutoDispatchTick,
    queuedComposerTurns,
    queuedSteerGate,
    removeQueuedComposerTurnFromDraft,
    threadId,
  ]);

  const onImplementPlanInNewThread = useCallback(async () => {
    const api = readNativeApi();
    if (
      !api ||
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      sendInFlightRef.current
    ) {
      return;
    }

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const implementationPrompt = buildPlanImplementationPrompt(planMarkdown);
    const outgoingImplementationPrompt = formatOutgoingComposerPrompt({
      provider: selectedProvider,
      model: selectedModel,
      effort: selectedPromptEffort,
      text: implementationPrompt,
    });
    const nextThreadTitle = truncateTitle(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModelSelection: ModelSelection = selectedModelSelection;
    const responseModifiers = makeNoMistakeResponseModifiers(makeNoMistakeLevel);
    const sourceProposedPlan = buildSourceProposedPlanReference({
      threadId: activeThread.id,
      proposedPlan: activeProposedPlan,
    });

    sendInFlightRef.current = true;
    beginLocalDispatch();
    const finish = () => {
      sendInFlightRef.current = false;
      resetLocalDispatch();
    };

    await api.orchestration
      .dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        modelSelection: nextThreadModelSelection,
        runtimeMode,
        interactionMode: "default",
        envMode: activeThread.envMode ?? (activeThread.worktreePath ? "worktree" : "local"),
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        workingDirectory: activeThread.workingDirectory ?? null,
        lastKnownPr: activeThread.lastKnownPr ?? null,
        associatedWorktreePath: activeThreadAssociatedWorktree.associatedWorktreePath,
        associatedWorktreeBranch: activeThreadAssociatedWorktree.associatedWorktreeBranch,
        associatedWorktreeRef: activeThreadAssociatedWorktree.associatedWorktreeRef,
        createdAt,
      })
      .then(() => {
        rememberCustomBinaryPathForDispatch({
          threadId: nextThreadId,
          provider: selectedModelSelection.provider,
          providerOptions: providerOptionsForDispatch,
        });
        return api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: outgoingImplementationPrompt,
            attachments: [],
          },
          modelSelection: selectedModelSelection,
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode,
          dispatchMode: "queue",
          runtimeMode,
          interactionMode: "default",
          ...(responseModifiers ? { responseModifiers } : {}),
          ...(sourceProposedPlan ? { sourceProposedPlan } : {}),
          createdAt,
        });
      })
      .then(() => {
        // The turn RPC resolved for a thread this view never made active, so
        // arm the watchdog marker with that exact thread id before navigation.
        markPendingTurnDispatch(nextThreadId);
        return api.orchestration.getShellSnapshot();
      })
      .then((snapshot) => {
        syncServerShellSnapshot(snapshot);
        // Signal that the plan sidebar should open on the new thread.
        planSidebarOpenOnNextThreadRef.current = true;
        return navigate({
          to: "/$threadId",
          params: { threadId: nextThreadId },
        });
      })
      .then(() => {
        setComposerDraftMakeNoMistakeLevel(activeThread.id, 0);
      })
      .catch(async (err) => {
        const deletedOnServer = await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: nextThreadId,
          })
          .then(() => true)
          .catch(() => false);
        if (deletedOnServer) {
          clearPendingTurnDispatch(nextThreadId);
          void reconcileDeletedThreadFromClient({
            threadId: nextThreadId,
            removeDeletedThreadFromClientState:
              useStore.getState().removeDeletedThreadFromClientState,
          });
        }
        toastManager.add({
          type: "error",
          title: "Could not start implementation thread",
          description:
            err instanceof Error ? err.message : "An error occurred while creating the new thread.",
        });
      })
      .then(finish, finish);
  }, [
    activeProject,
    activeProposedPlan,
    activeThread,
    activeThreadAssociatedWorktree,
    beginLocalDispatch,
    isConnecting,
    isSendBusy,
    isServerThread,
    makeNoMistakeLevel,
    navigate,
    resetLocalDispatch,
    runtimeMode,
    selectedPromptEffort,
    selectedModelSelection,
    providerOptionsForDispatch,
    rememberCustomBinaryPathForDispatch,
    selectedProvider,
    assistantDeliveryMode,
    syncServerShellSnapshot,
    selectedModel,
    setComposerDraftMakeNoMistakeLevel,
  ]);

  const setPromptFromTraits = useCallback(
    (nextPrompt: string) => {
      const currentPrompt = promptRef.current;
      if (nextPrompt === currentPrompt) {
        scheduleComposerFocus();
        return;
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      const nextCursor = collapseExpandedComposerCursor(nextPrompt, nextPrompt.length);
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      scheduleComposerFocus();
    },
    [promptRef, setComposerCursor, setComposerTrigger, scheduleComposerFocus, setPrompt],
  );
  const selectedProviderModelOptions = composerModelOptions?.[selectedProvider];
  const composerTraitSelection = getComposerTraitSelection(
    selectedProvider,
    selectedModel,
    prompt,
    selectedProviderModelOptions,
    selectedRuntimeModel,
  );
  const runtimeUsageContextWindow = useMemo(
    () =>
      activeContextWindowState.invalidatedByCompaction
        ? null
        : (activeContextWindow ??
          (selectedProvider === "claudeAgent"
            ? deriveSelectedContextWindowSnapshot(composerTraitSelection.contextWindow)
            : null)),
    [
      activeContextWindow,
      activeContextWindowState.invalidatedByCompaction,
      composerTraitSelection.contextWindow,
      selectedProvider,
    ],
  );
  const contextWindowSelectionStatus = useMemo(
    () =>
      deriveContextWindowSelectionStatus({
        activeSnapshot: runtimeUsageContextWindow,
        selectedValue:
          selectedProvider === "claudeAgent" ? composerTraitSelection.contextWindow : null,
      }),
    [runtimeUsageContextWindow, composerTraitSelection.contextWindow, selectedProvider],
  );
  const useSplitComposerPickerControls = isLocalDraftThread && !hasThreadStarted;
  const composerFooterControlsPlan = useMemo(
    () => composerFooterPlanForTier(composerFooterTier, Boolean(runtimeUsageContextWindow)),
    [composerFooterTier, runtimeUsageContextWindow],
  );
  // The displayed labels changed (model switch, effort change, picker layout):
  // recorded overflow widths no longer apply, so reset to the richest tier and
  // let the measured-overflow loop demote again before paint if needed.
  const composerFooterModelLabel = resolveProviderModelLabel({
    provider: selectedProvider,
    lockedProvider,
    model: selectedModelForPickerWithCustomFallback,
    modelOptionsByProvider,
  });
  const composerFooterTraitsSummary = resolveTraitsTriggerSummary({
    provider: selectedProvider,
    model: selectedModelForPickerWithCustomFallback,
    prompt,
    modelOptions: selectedProviderModelOptions,
    ...(selectedRuntimeModel ? { runtimeModel: selectedRuntimeModel } : {}),
    runtimeAgents: dynamicAgents,
  });
  const composerFooterPlanInputsKey = [
    composerFooterModelLabel,
    composerFooterTraitsSummary.summaryText,
    Boolean(runtimeUsageContextWindow),
    useSplitComposerPickerControls,
  ].join(":");
  useLayoutEffect(() => {
    composerFooterDemotionWidthsRef.current = [];
    composerFooterTierRef.current = 0;
    setComposerFooterTier(0);
    composerFooterLayoutSyncRef.current?.();
  }, [
    setComposerFooterTier,
    composerFooterTierRef,
    composerFooterDemotionWidthsRef,
    composerFooterLayoutSyncRef,
    composerFooterPlanInputsKey,
  ]);
  // After a tier renders, re-measure before paint: a still-overflowing footer
  // demotes another step until it fits (bounded by COMPOSER_FOOTER_MAX_TIER).
  useLayoutEffect(() => {
    composerFooterLayoutSyncRef.current?.();
  }, [composerFooterLayoutSyncRef, composerFooterTier]);
  const composerModelPickerWidthClassName = isComposerFooterCompact ? "w-32" : "w-36 sm:w-44";
  const composerOptionsPickerWidthClassName = isComposerFooterCompact ? "w-28" : "w-32";
  const composerModelEffortPickerWidthClassName = isComposerFooterCompact ? "w-40" : "w-44 sm:w-52";
  const isComposerModelEffortPickerOpen = isModelPickerOpen || isTraitsPickerOpen;
  const handleComposerModelEffortPickerOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        handleModelPickerOpenChange(true);
      } else {
        setIsModelPickerOpen(false);
        setIsTraitsPickerOpen(false);
      }
    },
    [setIsModelPickerOpen, setIsTraitsPickerOpen, handleModelPickerOpenChange],
  );
  const composerPickerControls = showComposerModelBootstrapSkeleton ? (
    useSplitComposerPickerControls ? (
      <>
        {selectedProviderRuntimeModelDiscoveryPending ? (
          <ComposerModelLoadingControl widthClassName={composerModelPickerWidthClassName} />
        ) : (
          <ComposerControlSkeleton widthClassName={composerModelPickerWidthClassName} />
        )}
        <ComposerControlSkeleton widthClassName={composerOptionsPickerWidthClassName} />
      </>
    ) : selectedProviderRuntimeModelDiscoveryPending ? (
      <ComposerModelLoadingControl widthClassName={composerModelEffortPickerWidthClassName} />
    ) : (
      <ComposerControlSkeleton widthClassName={composerModelEffortPickerWidthClassName} />
    )
  ) : useSplitComposerPickerControls ? (
    <>
      <ProviderModelPicker
        compact={isComposerFooterCompact}
        hideLabel={!composerFooterControlsPlan.showModelLabel}
        provider={selectedProvider}
        model={selectedModelForPickerWithCustomFallback}
        lockedProvider={lockedProvider}
        providers={providerStatuses}
        modelOptionsByProvider={modelOptionsByProvider}
        loadingModelProviders={loadingModelProviders}
        hiddenProviders={settings.hiddenProviders}
        providerOrder={settings.providerOrder}
        onProviderModelChange={onProviderModelSelect}
        onSelectionCommitted={scheduleComposerFocus}
        open={isModelPickerOpen}
        onOpenChange={handleModelPickerOpenChange}
        shortcutLabel={modelPickerShortcutLabel}
      />
      <TraitsPicker
        provider={selectedProvider}
        threadId={threadId}
        model={selectedModelForPickerWithCustomFallback}
        runtimeModel={selectedRuntimeModel}
        runtimeModels={runtimeModelsByProvider[selectedProvider]}
        runtimeAgents={dynamicAgents}
        modelOptions={selectedProviderModelOptions}
        prompt={prompt}
        onPromptChange={setPromptFromTraits}
        open={isTraitsPickerOpen}
        onOpenChange={handleTraitsPickerOpenChange}
        onSelectionCommitted={scheduleComposerFocus}
        shortcutLabel={traitsPickerShortcutLabel}
        hideLabel={!composerFooterControlsPlan.showTraitsLabel}
      />
    </>
  ) : (
    <ComposerModelEffortPicker
      compact={isComposerFooterCompact}
      hideModelLabel={!composerFooterControlsPlan.showModelLabel}
      hideStatusLabel={!composerFooterControlsPlan.showTraitsLabel}
      provider={selectedProvider}
      model={selectedModelForPickerWithCustomFallback}
      lockedProvider={lockedProvider}
      providers={providerStatuses}
      modelOptionsByProvider={modelOptionsByProvider}
      loadingModelProviders={loadingModelProviders}
      hiddenProviders={settings.hiddenProviders}
      providerOrder={settings.providerOrder}
      threadId={threadId}
      runtimeModel={selectedRuntimeModel}
      runtimeModels={runtimeModelsByProvider[selectedProvider]}
      runtimeAgents={dynamicAgents}
      modelOptions={selectedProviderModelOptions}
      prompt={prompt}
      onPromptChange={setPromptFromTraits}
      onProviderModelChange={onProviderModelSelect}
      onSelectionCommitted={scheduleComposerFocus}
      open={isComposerModelEffortPickerOpen}
      onOpenChange={handleComposerModelEffortPickerOpenChange}
      shortcutLabel={modelPickerShortcutLabel}
    />
  );
  const toggleFastMode = useCallback(() => {
    if (!composerTraitSelection.caps.supportsFastMode) {
      scheduleComposerFocus();
      return;
    }
    setComposerDraftProviderModelOptions(
      threadId,
      selectedProvider,
      buildNextProviderOptions(selectedProvider, selectedProviderModelOptions, {
        fastMode: !composerTraitSelection.fastModeEnabled,
      }),
      { persistSticky: true },
    );
    scheduleComposerFocus();
  }, [
    composerTraitSelection.caps.supportsFastMode,
    composerTraitSelection.fastModeEnabled,
    scheduleComposerFocus,
    selectedProvider,
    selectedProviderModelOptions,
    setComposerDraftProviderModelOptions,
    threadId,
  ]);
  const {
    onEnvModeChange,
    handleResetWorkspaceToHome,
    handleSelectWorkspaceRoot,
    handleSelectProjectForEmptyDraft,
    handleCreateProjectFromPickerPath,
  } = useChatWorkspaceSelection({
    threadId,
    activeThread,
    activeProject,
    activeRootBranch,
    isServerThread,
    isLocalDraftThread,
    isHomeChatContainer,
    isStudioContainer,
    hasNativeUserMessages,
    composerEditorRef,
    scheduleComposerFocus,
    defaultProvider: settings.defaultProvider,
  });

  const {
    applyPromptReplacement,
    resolveActiveComposerTrigger,
    applyComposerTriggerReplacement,
    handleSelectLocalDirectoryMention,
    handleNavigateLocalFolder,
    setComposerPromptValue,
    clearComposerSlashDraft,
  } = useChatComposerEditing({
    threadId,
    promptRef,
    activePendingProgress,
    activePendingUserInputKey,
    pendingUserInputAnswersByRequestIdRef,
    setPendingUserInputAnswersByRequestId,
    setPrompt,
    setComposerCursor,
    setComposerTrigger,
    composerEditorRef,
    composerCursor,
    composerTerminalContexts,
    setComposerHighlightedItemId,
    setRestoredQueuedSourceProposedPlan,
    clearComposerDraftContent,
    scheduleComposerFocus,
  });

  const slashEditorActions = useMemo(
    () => ({
      resolveActiveComposerTrigger,
      applyPromptReplacement,
      clearComposerSlashDraft,
      setComposerPromptValue,
      scheduleComposerFocus,
      setComposerHighlightedItemId,
    }),
    [
      setComposerHighlightedItemId,
      applyPromptReplacement,
      clearComposerSlashDraft,
      resolveActiveComposerTrigger,
      scheduleComposerFocus,
      setComposerPromptValue,
    ],
  );

  const {
    handleForkFromMessage,
    handleForkTargetSelection,
    handleReviewTargetSelection,
    isSlashStatusDialogOpen,
    setIsSlashStatusDialogOpen,
    handleStandaloneSlashCommand,
    handleSlashCommandSelection,
    clearThreadGoal,
    setThreadGoalPaused,
  } = useComposerSlashCommands({
    activeProject,
    activeThread,
    activeRootBranch,
    isServerThread,
    supportsFastSlashCommand,
    canOfferCompactCommand:
      canCompactThread &&
      isServerThread &&
      activeThread?.session !== null &&
      activeThread?.session?.status !== "closed",
    canOfferSideCommand,
    sidechatTargetProviders: handoffTargetProviders,
    canOfferExportCommand,
    supportsTextNativeReviewCommand,
    fastModeEnabled,
    providerNativeCommands,
    providerCommandDiscoveryCwd: providerModelDiscoveryCwd,
    selectedProvider,
    currentProviderModelOptions,
    selectedModelSelection,
    environmentMode: envMode ?? null,
    runtimeMode,
    interactionMode,
    threadId,
    syncServerShellSnapshot,
    navigateToThread: (nextThreadId, options) =>
      navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
        ...(options?.splitViewId ? { search: () => ({ splitViewId: options.splitViewId }) } : {}),
      }),
    handleClearConversation: async () => {
      if (!activeProject) {
        toastManager.add({
          type: "warning",
          title: "Clear is unavailable",
          description: "Open a project before starting a fresh thread.",
        });
        return;
      }
      await handleNewThread(activeProject.id, { entryPoint: "chat" });
    },
    handleInteractionModeChange,
    openForkTargetPicker: () => {
      setComposerCommandPicker("fork-target");
      setComposerHighlightedItemId("fork-target:worktree");
    },
    openReviewTargetPicker: () => {
      setComposerCommandPicker("review-target");
      setComposerHighlightedItemId("review-target:changes");
    },
    setComposerDraftProviderModelOptions,
    editorActions: slashEditorActions,
  });

  // Prefills "/goal <current text>" so editing reuses the same slash-command path
  // that created the goal, mirroring how queued turns restore into the composer.
  const editThreadGoalInComposer = useCallback(() => {
    const currentGoal = activeThread?.goal?.trim();
    if (!activeThread || !currentGoal) {
      return;
    }
    const nextPrompt = `/goal ${currentGoal}`;
    promptRef.current = nextPrompt;
    clearComposerDraftContent(activeThread.id);
    setComposerDraftPrompt(activeThread.id, nextPrompt);
    setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
    setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
    scheduleComposerFocus();
  }, [
    promptRef,
    setComposerCursor,
    setComposerTrigger,
    activeThread,
    clearComposerDraftContent,
    scheduleComposerFocus,
    setComposerDraftPrompt,
  ]);

  // Refreshed on every commit, in a layout effect rather than a passive one: the queued
  // dispatcher can run from the same commit's follow-up work, so there must be no window
  // where it sees the previous render's handlers. See `LateComposerSendHandlers`.
  useLayoutEffect(() => {
    lateComposerSendHandlersRef.current = {
      send: onSend,
      submitPlanFollowUp: onSubmitPlanFollowUp,
      advanceActivePendingUserInput: onAdvanceActivePendingUserInput,
      handleStandaloneSlashCommand,
    };
  });

  const {
    onSelectComposerItem,
    onComposerMenuItemHighlighted,
    onPromptChange,
    onComposerCommandKey,
  } = useChatComposerCommands({
    threadId,
    composerSelectLockRef,
    setComposerCommandPicker,
    setComposerHighlightedItemId,
    handleForkTargetSelection,
    handleReviewTargetSelection,
    resolveActiveComposerTrigger,
    applyComposerTriggerReplacement,
    handleNavigateLocalFolder,
    localFolderBrowseRootPath,
    handleSlashCommandSelection,
    selectedProvider,
    scheduleComposerFocus,
    updateSelectedComposerSkills,
    updateSelectedComposerMentions,
    onProviderModelSelect,
    composerMenuItems,
    composerHighlightedItemId,
    activePendingQuestion,
    activePendingUserInput,
    promptHistoryNavigationRef,
    restoreComposerDraftPromptHistorySavedDraft,
    promptRef,
    setPrompt,
    expectedPromptHistoryPromptRef,
    onChangeActivePendingUserInputCustomAnswer,
    setComposerDraftPromptHistorySavedDraft,
    applyingPromptHistoryNavigationRef,
    promptHistory,
    promptHistoryAppliedPromptRef,
    restoredQueuedSourceProposedPlanRef,
    setRestoredQueuedSourceProposedPlan,
    composerCommandPicker,
    composerTerminalContexts,
    setComposerDraftTerminalContexts,
    setComposerCursor,
    setComposerTrigger,
    clearComposerSlashDraft,
    toggleInteractionMode,
    composerMenuOpenRef,
    onSend,
    settings,
    hasLiveTurn,
    isLocalFolderBrowserOpen,
    localDirectoryMenuRef,
    composerMenuItemsRef,
    activeComposerMenuItemRef,
    activePendingProgress,
    isComposerApprovalState,
    pendingUserInputs,
    composerDraft,
  });
  const onExpandTimelineImage = useCallback(
    (preview: ExpandedImagePreview) => {
      setExpandedImage(preview);
    },
    [setExpandedImage],
  );

  const onOpenTurnDiff = useCallback(
    (turnId: TurnId, filePath?: string) => {
      if (diffEnvironmentPending) {
        return;
      }
      if (onOpenTurnDiffPanel) {
        onOpenTurnDiffPanel(turnId, filePath);
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return filePath
            ? {
                ...rest,
                panel: "diff",
                diff: "1",
                diffTurnId: turnId,
                diffFilePath: filePath,
              }
            : { ...rest, panel: "diff", diff: "1", diffTurnId: turnId };
        },
      });
    },
    [diffEnvironmentPending, navigate, onOpenTurnDiffPanel, threadId],
  );
  const onReviewComposerLiveChanges = useCallback(() => {
    if (!activeTurnLiveDiffState.turnId) {
      return;
    }
    onOpenTurnDiff(activeTurnLiveDiffState.turnId);
  }, [activeTurnLiveDiffState.turnId, onOpenTurnDiff]);
  const onNavigateToThread = useCallback(
    (nextThreadId: ThreadId) => {
      void navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
        search: (previous) =>
          isEditorRail
            ? { ...stripDiffSearchParams(previous), view: "editor" }
            : stripDiffSearchParams(previous),
      });
    },
    [isEditorRail, navigate],
  );
  const onOpenAutomation = useCallback(
    (automationId: string) => {
      void navigate({
        to: "/automations/$automationId",
        params: { automationId },
      });
    },
    [navigate],
  );
  const activeProjectIdForNewChat = activeProject?.id ?? null;
  const onNewEditorChat = useCallback(() => {
    if (!activeProjectIdForNewChat) {
      return;
    }
    // Keep the editor workspace view (and any open file) across the new-thread
    // navigation; the default new-thread flow clears all search params.
    void handleNewThread(activeProjectIdForNewChat, undefined, {
      search: (previous) => ({ ...stripDiffSearchParams(previous), view: "editor" }),
    });
  }, [activeProjectIdForNewChat, handleNewThread]);
  const onOpenEditorChat = useCallback(
    (nextThreadId: ThreadId) => {
      storeOpenChatThreadPage(nextThreadId);
      onNavigateToThread(nextThreadId);
    },
    [onNavigateToThread, storeOpenChatThreadPage],
  );
  const onOpenEditorTerminal = useCallback(() => {
    if (!activeThreadId) return;
    setTerminalPresentationMode("workspace");
    setTerminalWorkspaceLayout("terminal-only");
    setTerminalWorkspaceTab("terminal");
    requestTerminalFocus();
  }, [
    activeThreadId,
    requestTerminalFocus,
    setTerminalPresentationMode,
    setTerminalWorkspaceLayout,
    setTerminalWorkspaceTab,
  ]);
  const onCloseEditorTerminal = useCallback(() => {
    void closeTerminal(terminalState.activeTerminalId);
  }, [closeTerminal, terminalState.activeTerminalId]);
  const onRevertUserMessage = useCallback(
    (messageId: MessageId) => {
      const targetTurnCount = revertTurnCountByUserMessageId.get(messageId);
      if (typeof targetTurnCount !== "number") {
        return;
      }
      void onRevertToTurnCount(targetTurnCount);
    },
    [onRevertToTurnCount, revertTurnCountByUserMessageId],
  );
  const onRunProjectScriptFromHeader = useCallback(
    (script: ProjectScript) => {
      void runProjectScript(script);
    },
    [runProjectScript],
  );
  const dismissActiveThreadError = useCallback(() => {
    if (!activeThread) return;
    setThreadError(activeThread.id, null);
  }, [activeThread, setThreadError]);
  const clearThreadErrorAfterUnblock = useCallback(
    (unblockedThreadId: ThreadId) => {
      setThreadError(unblockedThreadId, null);
    },
    [setThreadError],
  );
  const { unblockThread: unblockActiveThread, unblocking: unblockingActiveThread } =
    useThreadUnblock({
      threadId: activeThread?.id ?? null,
      onUnblocked: clearThreadErrorAfterUnblock,
    });
  useThreadErrorToast({
    threadId: activeThread?.id ?? null,
    error: activeThread?.error ?? null,
    onDismiss: dismissActiveThreadError,
    onUnblock: unblockActiveThread,
    unblocking: unblockingActiveThread,
  });
  const dismissActiveProviderHealthBanner = useCallback(() => {
    if (!activeProviderHealthBannerDismissalKey) return;
    setDismissedProviderHealthBannerKeys((current) => {
      if (current.includes(activeProviderHealthBannerDismissalKey)) {
        return current;
      }
      return [activeProviderHealthBannerDismissalKey, ...current].slice(
        0,
        MAX_DISMISSED_PROVIDER_HEALTH_BANNERS,
      );
    });
  }, [activeProviderHealthBannerDismissalKey, setDismissedProviderHealthBannerKeys]);
  const dismissActiveRateLimitBanner = useCallback(() => {
    if (!activeRateLimitBannerDismissalKey) return;
    setDismissedRateLimitBannerKey(activeRateLimitBannerDismissalKey);
  }, [setDismissedRateLimitBannerKey, activeRateLimitBannerDismissalKey]);

  // Empty state: no active thread
  if (!activeThread) {
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col text-[var(--color-text-foreground-secondary)]",
          CHAT_BACKGROUND_CLASS_NAME,
        )}
      >
        {!isElectron && (
          <header className={cn(CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME, "px-3 py-2 md:hidden")}>
            <div className="flex items-center gap-2">
              <SidebarHeaderTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-[var(--color-text-foreground)]">
                Threads
              </span>
            </div>
          </header>
        )}
        {isElectron && (
          <div
            className={cn(
              CHAT_SURFACE_HEADER_ROW_CLASS_NAME,
              "drag-region px-5",
              desktopTopBarTrafficLightGutterClassName,
              desktopTopBarWindowControlsGutterClassName,
            )}
          >
            <SidebarHeaderNavigationControls />
            <span className="text-xs text-muted-foreground/50">No active thread</span>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm">Select a thread or create a new one to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  const activeThreadDisplayTitle = resolveActiveThreadTitle({
    title: activeThread.title,
    subagentTitle: activeThread.parentThreadId
      ? resolveSubagentPresentationForThread({
          thread: activeThread,
          threads: threadLineageThreads,
        }).fullLabel
      : null,
    isHomeChat: isChatProject,
    isEmpty: timelineEntries.length === 0,
  });

  const handleRenameActiveThread = async (newTitle: string) => {
    const outcome = await dispatchThreadRename({
      threadId: activeThread.id,
      newTitle,
      unchangedTitles: [activeThread.title],
      createIfMissing: isLocalDraftThread
        ? {
            projectId: activeThread.projectId,
            modelSelection: activeThread.modelSelection,
            runtimeMode: activeThread.runtimeMode,
            interactionMode: activeThread.interactionMode,
            envMode: activeThread.envMode ?? "local",
            branch: activeThread.branch,
            worktreePath: activeThread.worktreePath,
            workingDirectory: activeThread.workingDirectory ?? null,
            ...(activeThread.lastKnownPr !== undefined
              ? { lastKnownPr: activeThread.lastKnownPr }
              : {}),
            createdAt: activeThread.createdAt,
          }
        : undefined,
    }).catch((error) => {
      toastManager.add({
        type: "error",
        title: "Failed to rename thread",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
      throw error;
    });

    if (outcome === "empty") {
      toastManager.add({
        type: "warning",
        title: "Thread title cannot be empty",
      });
      return;
    }
    if (outcome === "unchanged" || outcome === "unavailable") {
      return;
    }
  };

  const runtimeUsageControlsProps = {
    provider: selectedProvider,
    runtimeModel: selectedRuntimeModel,
    providerStatus: activeProviderStatus,
    runtimeMode,
    onRuntimeModeChange: handleRuntimeModeChange,
    contextWindow: runtimeUsageContextWindow,
    cumulativeCostUsd: activeCumulativeCostUsd,
    activeContextWindowLabel: contextWindowSelectionStatus.activeLabel,
    pendingContextWindowLabel: contextWindowSelectionStatus.pendingSelectedLabel,
  };
  // The composer's leading controls (extras "+" menu, access-rules/runtime
  // indicator). At the narrowest footer tier they relocate from the footer to
  // the branch-toolbar row below the input instead of getting clipped; the
  // relocated variant is icon-only since relocation means space is minimal.
  const relocateComposerLeadingControls = composerFooterControlsPlan.relocateLeadingControls;
  const renderComposerLeadingControls = (options: { iconOnly: boolean }) => (
    <>
      <ComposerExtrasMenu
        interactionMode={interactionMode}
        supportsFastMode={composerTraitSelection.caps.supportsFastMode}
        fastModeEnabled={composerTraitSelection.fastModeEnabled}
        bullyModeEnabled={settings.bullyModeEnabled}
        onAddAttachments={addComposerAttachments}
        onToggleFastMode={toggleFastMode}
        onBullyModeChange={handleBullyModeChange}
        onInteractionModeChange={handleInteractionModeChange}
      />
      {!isVoiceRecording && !isVoiceTranscribing ? (
        <RuntimeUsageControls
          {...runtimeUsageControlsProps}
          className="shrink-0"
          hideLabel={options.iconOnly}
        />
      ) : null}
    </>
  );
  const branchToolbarProps = {
    threadId: activeThread.id,
    onEnvModeChange,
    envLocked,
    threadDetailReady: threadDetailHydration === "ready",
    onHandoffToWorktree,
    onHandoffToLocal,
    handoffBusy,
    onComposerFocusRequest: scheduleComposerFocus,
    ...(isStudioContainer ? { fixedLocalWorkspaceCwd: threadWorkspaceCwd } : {}),
    ...(canCheckoutPullRequestIntoThread
      ? { onCheckoutPullRequestRequest: openPullRequestDialog }
      : {}),
  };
  const showEmptyLandingBranchToolbar =
    isCenteredEmptyLanding && activeProject?.kind === "project" && !isHomeChatContainer;
  // Temporary is chosen while starting a chat. Draft metadata covers local reloads;
  // the in-memory marker keeps the badge + auto-delete alive through promotion.
  const isThreadTemporary = draftThread?.isTemporary === true || hasTemporaryThreadMarker;
  const toggleDraftTemporary = () => {
    const next = !isThreadTemporary;
    setDraftThreadContext(threadId, { isTemporary: next });
    if (next) {
      markTemporaryThread(threadId);
    } else {
      clearTemporaryThread(threadId);
    }
  };
  const showEmptyLandingProjectPicker =
    isCenteredEmptyLanding && isLocalDraftThread && activeProject?.kind === "project";
  const showContainerChatWorkspacePicker =
    isEmptyChatLanding && (isHomeChatContainer || isStudioContainer);
  const emptyLandingProjectChip =
    !showContainerChatWorkspacePicker &&
    !showEmptyLandingProjectPicker &&
    activeProjectDisplayName ? (
      <span className="inline-flex min-w-0 max-w-56 shrink items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-[length:var(--app-font-size-ui-sm,11px)] font-normal text-[var(--color-text-foreground-secondary)] sm:max-w-64">
        <FolderClosed className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{activeProjectDisplayName}</span>
      </span>
    ) : null;
  const showEmptyLandingControls =
    isCenteredEmptyLanding &&
    (isEmptyChatLanding ||
      showEmptyLandingProjectPicker ||
      emptyLandingProjectChip !== null ||
      showEmptyLandingBranchToolbar);
  const emptyLandingControls = showEmptyLandingControls ? (
    <div
      data-empty-landing-controls="true"
      // United-but-not-fused tray sitting in normal flow directly above the composer at a
      // narrower width (w-11/12): tinted, rounded on top only, flush against the input
      // shell below. No overlap/underlay tricks — in dark mode a slice tucked behind the
      // composer's translucent corners reads as a visible cut along the seam.
      className="chat-composer-shell mx-auto flex min-h-8 w-11/12 min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden !rounded-b-none !rounded-t-[var(--composer-radius)] bg-[color-mix(in_srgb,var(--color-background-elevated-secondary)_76%,var(--color-background-surface)_24%)] px-2 py-1.5 transition-colors duration-150 ease-out motion-reduce:transition-none sm:min-h-7"
    >
      {showContainerChatWorkspacePicker ? (
        <ProjectPicker
          align="start"
          side="top"
          triggerClassName="h-7 py-1"
          showResetToHome={Boolean(
            isStudioContainer ? resolvedThreadWorkingDirectory : resolvedThreadWorktreePath,
          )}
          selectedWorkspaceRoot={
            isStudioContainer ? resolvedThreadWorkingDirectory : resolvedThreadWorktreePath
          }
          onSelectWorkspaceRoot={handleSelectWorkspaceRoot}
          onResetToHome={handleResetWorkspaceToHome}
          {...(!isStudioContainer
            ? {
                onSelectProject: handleSelectProjectForEmptyDraft,
                onCreateProjectFromPath: handleCreateProjectFromPickerPath,
              }
            : {})}
        />
      ) : showEmptyLandingProjectPicker ? (
        <ProjectPicker
          align="start"
          side="top"
          triggerClassName="h-7 py-1"
          selectionMode="project"
          selectedProjectId={activeProject.id}
          selectedWorkspaceRoot={activeProject.cwd}
          showResetToHome
          onSelectProject={handleSelectProjectForEmptyDraft}
          onCreateProjectFromPath={handleCreateProjectFromPickerPath}
          onResetToHome={handleResetWorkspaceToHome}
        />
      ) : (
        emptyLandingProjectChip
      )}
      {/* Reserve the Local/branch slot so project selection fades controls in without resizing. */}
      <div
        aria-hidden={showEmptyLandingBranchToolbar ? undefined : true}
        className={cn(
          "flex min-w-0 flex-1 items-center transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          showEmptyLandingBranchToolbar
            ? "translate-y-0 opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        {showEmptyLandingBranchToolbar ? (
          <BranchToolbar
            {...branchToolbarProps}
            className="mx-0 min-w-0 flex-1 !justify-start !px-0 !pb-0 !pt-0"
            showBranchSelector={isGitRepo}
          />
        ) : null}
      </div>
      {showEmptyLandingBranchToolbar ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={isThreadTemporary}
          onClick={toggleDraftTemporary}
          title={
            isThreadTemporary
              ? "Temporary chat — deleted when you leave. Click to keep it."
              : "Make this a temporary chat (deleted when you leave)"
          }
          aria-label="Temporary chat"
          className={cn(
            "ml-auto shrink-0 gap-1.5 whitespace-nowrap px-2 text-[length:var(--app-font-size-ui-sm,11px)] font-normal transition-colors sm:px-2.5",
            isThreadTemporary
              ? "text-[var(--color-text-accent)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-accent)]"
              : "text-[var(--color-text-foreground-secondary)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]",
          )}
        >
          <TemporaryThreadIcon className="size-3.5" />
          <span className="sr-only sm:not-sr-only">Temporary</span>
        </Button>
      ) : null}
    </div>
  ) : null;

  const threadAutomationItems = automationsForThread(
    automationData.definitions,
    activeThread.id,
  ).map((definition) => ({ definition }));

  // Shared inputs for both Environment panel surfaces (the header Popover when the dock is
  // open, and the docked right column when it is closed) so the two never drift.
  const environmentPanelProps: Omit<EnvironmentPanelProps, "open" | "variant"> = {
    gitCwd: threadWorkspaceCwd,
    openInTarget: threadWorkspaceCwd,
    githubRepository: githubRepositoryQuery.data?.repository ?? null,
    githubRepositories: githubRepositoryQuery.data?.repositories ?? [],
    isGitRepo,
    keybindings,
    availableEditors,
    activeThreadId: activeThread.id,
    activeProvider: activeThread.session?.provider ?? activeThread.modelSelection.provider,
    isStudioChat: isStudioContainer,
    studioFolderPath: isStudioContainer ? resolvedThreadWorkingDirectory : null,
    showGitActions,
    diffOpen: resolvedDiffOpen,
    threadAutomations: threadAutomationItems,
    diffDisabledReason,
    diffTotals: repoDiffTotals,
    branchToolbar: branchToolbarProps,
    recap: threadRecap,
    pinnedMessages,
    threadMarkers,
    pinnedMessageTextById,
    markerMessageTextById,
    notes: threadNotes,
    activeProjectId,
    activeProjectCreatedAt: activeProject?.createdAt ?? null,
    projectInstructions,
    canCopyProjectInstructionsToNotes: !isLocalDraftThread,
    onProjectInstructionsChange: setProjectInstructions,
    onCopyProjectInstructionsToNotes: handleCopyProjectInstructionsToNotes,
    onToggleDiff,
    onOpenAutomation: (definition: AutomationDefinition) => onOpenAutomation(definition.id),
    onOpenGithubRepository: openBrowserUrl,
    onJumpToPinnedMessage: handleJumpToPinnedMessage,
    onTogglePinnedMessageDone: handleTogglePinnedMessageDone,
    onUnpinMessage: handleUnpinMessage,
    onRenamePinnedMessage: handleRenamePinnedMessage,
    onJumpToThreadMarker: handleJumpToThreadMarker,
    onToggleThreadMarkerDone: handleToggleThreadMarkerDone,
    onRemoveThreadMarker: handleRemoveThreadMarker,
    onRenameThreadMarker: handleRenameThreadMarker,
    onNotesChange: handleNotesChange,
    onOpenEditorView: viewModeAction?.onClick ?? null,
    onClose: closeEnvironmentPanelAfterAction,
    onRegisterCommitAndPushTrigger,
  };
  // Full-width single chat: overlay plus transcript/composer inset. Floating overlay when the
  // column is already narrow — right dock open or a split pane (same as header compact mode).
  // Terminal surfaces always float so opening Environment never resizes the terminal workspace.
  const environmentAppliesContentInset = environmentPanelVisible && !environmentUsesFloatingOverlay;
  const environmentOverlayVariant = environmentUsesFloatingOverlay ? "floating" : "docked";
  const environmentHeaderState = environmentEnabled
    ? {
        open: environmentPanelVisible,
        onOpenChange: setEnvironmentPanelOpenPreference,
      }
    : null;

  const showComposerLiveChangesHeader = latestTurnLive && activeTurnLiveDiffState.hasChanges;
  const showComposerActiveTaskListCard = Boolean(activeTaskList && !planSidebarOpen);
  const showComposerWorkflowRunCard = workflowRunState !== null;
  const showComposerSubagentStrip = composerSubagentStripItems.length > 0;
  const activeThreadGoalText = activeThread?.goal?.trim() ?? "";
  const showComposerGoalHeader = activeThreadGoalText.length > 0;
  // The workflow card already lists its run and member agents, so the generic
  // "N background agents" footer only counts tasks outside the workflow.
  const composerBackgroundTaskCount = workflowRunState
    ? (activeBackgroundTasks?.taskIds.filter((taskId) => !workflowRunState.taskIds.includes(taskId))
        .length ?? 0)
    : (activeBackgroundTasks?.activeCount ?? 0);

  // Composer layout keeps the task list and footer actions in one render path so
  // follow-up prompts and normal chat mode stay visually in sync.
  const renderActiveTaskListCard = (attachedToPrevious: boolean) =>
    activeTaskList && showComposerActiveTaskListCard ? (
      <ComposerActiveTaskListCard
        activeTaskList={activeTaskList}
        backgroundTaskCount={composerBackgroundTaskCount}
        compact={activeTaskListCompact}
        onCompactChange={setActiveTaskListCompact}
        onOpenSidebar={() => setPlanSidebarOpen(true)}
        attachedToPrevious={attachedToPrevious}
      />
    ) : null;

  const composerSection =
    secondaryChromeReady && shouldRenderChatPaneContent ? (
      <div
        className={cn(isCenteredEmptyLanding ? "w-full overflow-visible" : "contents")}
        data-empty-landing-composer-block={isCenteredEmptyLanding ? "true" : undefined}
      >
        <form
          ref={composerFormRef}
          onSubmit={onSend}
          className="relative z-10 w-full overflow-visible"
          data-chat-composer-form="true"
          data-chat-pane-scope={paneScopeId}
        >
          <ComposerColumnFrame>
            {/* A bare wrapper keeps the normal-flow panels' -mb-px seam onto the input shell
                via margin collapse. */}
            <div>
              {showComposerLiveChangesHeader ? (
                <ComposerLiveChangesHeader
                  fileCount={activeTurnLiveDiffState.fileCount}
                  additions={activeTurnLiveDiffState.additions}
                  deletions={activeTurnLiveDiffState.deletions}
                  onReview={
                    activeTurnLiveDiffState.turnId ? onReviewComposerLiveChanges : undefined
                  }
                />
              ) : null}
              {renderActiveTaskListCard(showComposerLiveChangesHeader)}
              {workflowRunState ? (
                <WorkflowRunCard
                  workflowRun={workflowRunState}
                  compact={workflowRunCardCompact}
                  onCompactChange={setWorkflowRunCardCompact}
                  onOpenThread={onNavigateToThread}
                  onStop={onStopWorkflowRun}
                  onPause={onPauseWorkflowRun}
                  onResume={onResumeWorkflowRun}
                  onDismiss={onDismissWorkflowRun}
                  attachedToPrevious={
                    showComposerLiveChangesHeader || showComposerActiveTaskListCard
                  }
                />
              ) : null}
              {showComposerSubagentStrip ? (
                <ComposerSubagentStrip
                  items={composerSubagentStripItems}
                  compact={subagentStripCompact}
                  onCompactChange={setSubagentStripCompact}
                  onOpenThread={onNavigateToThread}
                  onBackgroundItem={onBackgroundSubagentStripItem}
                  onStopItem={onStopSubagentStripItem}
                  onStopAll={onStopAllSubagentStripItems}
                  attachedToPrevious={
                    showComposerLiveChangesHeader ||
                    showComposerActiveTaskListCard ||
                    showComposerWorkflowRunCard
                  }
                />
              ) : null}
              <ComposerQueuedHeader
                queuedTurns={queuedComposerTurns}
                onSteer={onSteerQueuedComposerTurn}
                onRemove={removeQueuedComposerTurn}
                onEdit={onEditQueuedComposerTurn}
                cwd={threadWorkspaceCwd ?? undefined}
                attachedToPrevious={
                  showComposerLiveChangesHeader ||
                  showComposerActiveTaskListCard ||
                  showComposerWorkflowRunCard ||
                  showComposerSubagentStrip
                }
              />
              {showComposerGoalHeader && activeThread ? (
                <ComposerGoalHeader
                  goal={activeThreadGoalText}
                  goalStartedAt={activeThread.goalStartedAt}
                  goalPausedAt={activeThread.goalPausedAt}
                  canPause={isServerThread}
                  onEdit={editThreadGoalInComposer}
                  onSetPaused={async (paused) => {
                    await setThreadGoalPaused(paused);
                  }}
                  onClear={clearThreadGoal}
                  attachedToPrevious={
                    showComposerLiveChangesHeader ||
                    showComposerActiveTaskListCard ||
                    showComposerWorkflowRunCard ||
                    showComposerSubagentStrip ||
                    queuedComposerTurns.length > 0
                  }
                />
              ) : null}
              {settledThreadBranchMismatch ? (
                <div className="pb-2">
                  <ComposerBranchMismatchBanner {...settledThreadBranchMismatch} />
                </div>
              ) : null}
              {/* Pending approvals and AskUserQuestion prompts both render as a detached
                  card floating just above the composer (padding gives the measured gap),
                  instead of a banner fused into the composer surface. An approval takes
                  precedence and suppresses the question card while one is active. */}
              {activePendingApproval ? (
                <div className="pb-2">
                  <ComposerPendingApprovalPanel
                    key={pendingRequestInstanceKey(
                      activePendingApproval.requestId,
                      activePendingApproval.lifecycleGeneration,
                    )}
                    workspaceRoot={threadWorkspaceCwd}
                    approval={activePendingApproval}
                    pendingCount={pendingApprovals.length}
                    isResponding={respondingRequestKeys.includes(
                      pendingRequestInstanceKey(
                        activePendingApproval.requestId,
                        activePendingApproval.lifecycleGeneration,
                      ),
                    )}
                    onRespond={onRespondToApproval}
                  />
                </div>
              ) : pendingUserInputs.length > 0 ? (
                <div className="pb-2">
                  <ComposerPendingUserInputPanel
                    pendingUserInputs={pendingUserInputs}
                    isResponding={activePendingIsResponding}
                    answers={activePendingDraftAnswers}
                    questionIndex={activePendingQuestionIndex}
                    onToggleOption={onToggleActivePendingUserInputOption}
                    onAdvance={onAdvanceActivePendingUserInput}
                    onPrevious={onPreviousActivePendingUserInputQuestion}
                    onCancel={onCancelActivePendingUserInput}
                  />
                </div>
              ) : null}
              {emptyLandingControls}
            </div>
            <div
              className={cn(
                COMPOSER_INPUT_SHELL_CLASS_NAME,
                composerProviderState.composerFrameClassName,
                composerMenuOpen && !isComposerApprovalState && "overflow-visible",
              )}
            >
              <div
                className={cn(
                  COMPOSER_INPUT_SURFACE_CLASS_NAME,
                  composerProviderState.composerSurfaceClassName,
                  composerMenuOpen && !isComposerApprovalState && "overflow-visible",
                )}
              >
                <ComposerInputBanners
                  roundedTopReset={false}
                  planFollowUp={
                    !activePendingApproval &&
                    pendingUserInputs.length === 0 &&
                    showPlanFollowUpPrompt &&
                    activeProposedPlan
                      ? {
                          id: activeProposedPlan.id,
                          title: proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null,
                        }
                      : null
                  }
                  automationSetup={
                    !activePendingApproval &&
                    pendingUserInputs.length === 0 &&
                    pendingAutomationConversation &&
                    pendingAutomationConversation.threadId === threadId
                      ? { onCancel: cancelAutomationConversation }
                      : null
                  }
                />
                <div
                  className={cn(
                    COMPOSER_EDITOR_PADDING_CLASS_NAME,
                    composerMenuOpen && !isComposerApprovalState && "overflow-visible",
                  )}
                >
                  {composerMenuOpen && !isComposerApprovalState ? (
                    <div className={COMPOSER_COMMAND_MENU_FLOATING_WRAPPER_CLASS_NAME}>
                      {isLocalFolderBrowserOpen ? (
                        <ComposerLocalDirectoryMenu
                          mentionQuery={mentionTriggerQuery}
                          rootLabel={localFolderBrowseRootPath ?? "Local folders unavailable"}
                          homeDir={serverConfigQuery.data?.homeDir ?? null}
                          onSelectEntry={(absolutePath) =>
                            handleSelectLocalDirectoryMention(absolutePath)
                          }
                          onNavigateFolder={handleNavigateLocalFolder}
                          handleRef={localDirectoryMenuRef}
                        />
                      ) : (
                        <ComposerCommandMenu
                          items={composerMenuItems}
                          resolvedTheme={resolvedTheme}
                          isLoading={isComposerMenuLoading}
                          triggerKind={
                            composerCommandPicker !== null
                              ? "slash-command"
                              : effectiveComposerTriggerKind
                          }
                          activeItemId={activeComposerMenuItem?.id ?? null}
                          onHighlightedItemChange={onComposerMenuItemHighlighted}
                          onSelect={onSelectComposerItem}
                        />
                      )}
                    </div>
                  ) : null}
                  {!isComposerApprovalState &&
                    pendingUserInputs.length === 0 &&
                    isPreparingComposerImages && (
                      <div
                        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
                        role="status"
                      >
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                        Optimizing {pendingComposerImageCount === 1 ? "image" : "images"}…
                      </div>
                    )}
                  {!isComposerApprovalState &&
                    pendingUserInputs.length === 0 &&
                    (composerAssistantSelections.length > 0 ||
                      composerBrowserAnnotations.length > 0 ||
                      composerFileComments.length > 0 ||
                      composerPastedTexts.length > 0 ||
                      composerFiles.length > 0 ||
                      composerImages.length > 0) && (
                      <ComposerReferenceAttachments
                        assistantSelections={composerAssistantSelections}
                        browserAnnotations={composerBrowserAnnotations}
                        fileComments={composerFileComments}
                        pastedTexts={composerPastedTexts}
                        files={composerFiles}
                        images={composerImages}
                        nonPersistedImageIdSet={nonPersistedComposerImageIdSet}
                        onExpandImage={setExpandedImage}
                        onRemoveAssistantSelections={clearComposerAssistantSelectionsFromDraft}
                        onRemoveBrowserAnnotation={removeComposerBrowserAnnotationFromDraft}
                        onRemoveFileComments={clearComposerFileCommentsFromDraft}
                        onRemovePastedText={removeComposerPastedTextFromDraft}
                        onShowPastedTextInField={showComposerPastedTextInField}
                        onRemoveFile={removeComposerFile}
                        onRemoveImage={removeComposerImage}
                      />
                    )}
                  <ComposerPromptEditor
                    ref={composerEditorRef}
                    value={
                      isComposerApprovalState
                        ? ""
                        : activePendingProgress
                          ? activePendingProgress.customAnswer
                          : prompt
                    }
                    cursor={composerCursor}
                    terminalContexts={
                      !isComposerApprovalState && pendingUserInputs.length === 0
                        ? composerTerminalContexts
                        : []
                    }
                    mentionReferences={selectedComposerMentions}
                    onRemoveTerminalContext={removeComposerTerminalContextFromDraft}
                    onChange={onPromptChange}
                    onCommandKeyDown={onComposerCommandKey}
                    onPaste={onComposerPaste}
                    {...(canCollapsePastedTextToDraft
                      ? { onCollapsePastedText: addPastedTextToDraft }
                      : {})}
                    placeholder={
                      isComposerApprovalState
                        ? "Resolve this approval request to continue"
                        : activePendingProgress
                          ? activePendingProgress.activeQuestion?.options.length === 0
                            ? "Type your answer to continue"
                            : "Type your own answer, or leave this blank to use the selected option"
                          : showPlanFollowUpPrompt && activeProposedPlan
                            ? "Add feedback to refine the plan, or leave this blank to implement it"
                            : activeThread?.parentThreadId
                              ? "Message this subagent while it works"
                              : hasLiveTurn
                                ? "Ask for follow-up changes"
                                : phase === "disconnected"
                                  ? "Ask for follow-up changes or attach images"
                                  : "Ask anything, @tag files/folders, or use / to show available commands"
                    }
                    disabled={isComposerEditorDisabled}
                  />
                </div>
                {/* Bottom toolbar — hidden while an approval takes over the composer,
                    since the approve/decline actions live in the detached approval card
                    floating above (see ComposerPendingApprovalPanel). */}
                {activePendingApproval ? null : (
                  <ChatComposerFooter
                    isComposerFooterCompact={isComposerFooterCompact}
                    leadingControls={
                      relocateComposerLeadingControls
                        ? null
                        : renderComposerLeadingControls({ iconOnly: false })
                    }
                    composerPickerControls={composerPickerControls}
                    contextMeter={
                      !isVoiceRecording &&
                      !isVoiceTranscribing &&
                      runtimeUsageContextWindow &&
                      composerFooterControlsPlan.showContextMeter ? (
                        <ContextWindowMeter
                          usage={runtimeUsageContextWindow}
                          {...(activeCumulativeCostUsd != null
                            ? { cumulativeCostUsd: activeCumulativeCostUsd }
                            : {})}
                          {...(contextWindowSelectionStatus.activeLabel !== undefined
                            ? { activeWindowLabel: contextWindowSelectionStatus.activeLabel }
                            : {})}
                          {...(contextWindowSelectionStatus.pendingSelectedLabel !== undefined
                            ? {
                                pendingWindowLabel:
                                  contextWindowSelectionStatus.pendingSelectedLabel,
                              }
                            : {})}
                        />
                      ) : null
                    }
                    interactionMode={interactionMode}
                    resetInteractionMode={resetInteractionMode}
                    modeControls={
                      !activePendingProgress ? (
                        <>
                          <ComposerBullyModeIndicator
                            enabled={settings.bullyModeEnabled}
                            onEnabledChange={handleBullyModeChange}
                          />
                          <ComposerMakeNoMistakeControl
                            level={makeNoMistakeLevel}
                            onLevelChange={(level) =>
                              setComposerDraftMakeNoMistakeLevel(threadId, level)
                            }
                          />
                        </>
                      ) : null
                    }
                    sidebarAction={
                      activeTaskList || sidebarProposedPlan || planSidebarOpen
                        ? {
                            title: planSidebarToggleTitle,
                            label: planSidebarToggleLabel,
                            onClick: togglePlanSidebar,
                          }
                        : null
                    }
                    voice={{
                      enabled: showVoiceNotesControl,
                      recording: isVoiceRecording,
                      transcribing: isVoiceTranscribing,
                      durationLabel: voiceRecordingDurationLabel,
                      waveformLevels: voiceWaveformLevels,
                      onCancel: cancelComposerVoiceRecording,
                      onSubmit: submitComposerVoiceRecording,
                      onToggle: toggleComposerVoiceRecording,
                    }}
                    pendingInput={
                      activePendingProgress
                        ? {
                            progress: activePendingProgress,
                            responding: activePendingIsResponding,
                            answersComplete: Boolean(activePendingResolvedAnswers),
                          }
                        : null
                    }
                    submission={{
                      phase,
                      busy: isSendBusy,
                      connecting: isConnecting,
                      expired: false,
                      preparingImages: isPreparingComposerImages,
                      preparingWorktree: isPreparingWorktree,
                      hasContent: composerSendState.hasSendableContent,
                      hasPendingUserInputs: pendingUserInputs.length > 0,
                      showPlanFollowUp: showPlanFollowUpPrompt,
                      hasPrompt: prompt.trim().length > 0,
                      onInterrupt: onInterruptFromStopControl,
                      onImplementInNewThread: onImplementPlanInNewThread,
                    }}
                  />
                )}
              </div>
            </div>
          </ComposerColumnFrame>
        </form>
      </div>
    ) : (
      <div
        aria-hidden="true"
        className="w-full overflow-visible"
        data-chat-composer-form="deferred"
      >
        <div
          className={cn(COMPOSER_INPUT_SURFACE_CLASS_NAME, COMPOSER_COLUMN_FRAME_CLASS_NAME)}
          style={{ height: secondaryChromePlaceholderHeight }}
        />
      </div>
    );

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        CHAT_BACKGROUND_CLASS_NAME,
      )}
      onDragEnter={onComposerDragEnter}
      onDragOver={onComposerDragOver}
      onDragLeave={onComposerDragLeave}
      onDrop={onComposerDrop}
    >
      {/* Subtle accent tint over the whole pane while a file is dragged anywhere over it,
          signalling that dropping it will attach the file to the composer. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-50 transition-opacity duration-150",
          "bg-info/8 ring-1 ring-inset ring-info/30",
          isDragOverComposer ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Top bar */}
      <header
        className={cn(
          CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
          !isEditorRail && CHAT_SURFACE_HEADER_PADDING_X_CLASS,
          "flex items-center",
          isEditorRail ? "h-10" : CHAT_SURFACE_HEADER_HEIGHT_CLASS,
          isElectron && "drag-region",
          // The editor-rail chat header sits in the editor's second row (inside the
          // right-side chat pane), not flush against the window edges — the editor's
          // own top bar already reserves both desktop window-control gutters. Applying
          // them here just leaves redundant empty space on the sides.
          !isEditorRail && desktopTopBarTrafficLightGutterClassName,
          !isEditorRail && desktopTopBarWindowControlsGutterClassName,
        )}
      >
        <ChatHeader
          activeThreadId={activeThread.id}
          activeThreadTitle={activeThreadDisplayTitle}
          activeThreadEntryPoint={terminalState.entryPoint}
          activeProvider={activeThread.session?.provider ?? activeThread.modelSelection.provider}
          activeProjectName={isEditorRail ? undefined : activeProjectDisplayName}
          threadBreadcrumbs={threadBreadcrumbs}
          {...(isEditorRail
            ? { className: cn(CHAT_SURFACE_HEADER_PADDING_X_CLASS, "h-full") }
            : {})}
          isSidechat={Boolean(activeThread.sidechatSourceThreadId)}
          hideSidebarControls={isEditorRail}
          hideHandoffControls={terminalWorkspaceTerminalTabActive || isEditorRail}
          minimalChrome={isCenteredEmptyLanding}
          isGitRepo={isGitRepo}
          openInTarget={threadWorkspaceCwd}
          activeProjectScripts={isEditorRail ? undefined : activeProjectScripts}
          preferredScriptId={
            activeProject ? (lastInvokedScriptByProjectId[activeProject.id] ?? null) : null
          }
          keybindings={keybindings}
          availableEditors={availableEditors}
          diffToggleShortcutLabel={diffPanelShortcutLabel}
          handoffBadgeLabel={handoffBadgeLabel}
          handoffActionLabel={handoffActionLabel}
          handoffDisabled={handoffDisabled}
          handoffActionTargetProviders={handoffTargetProviders}
          handoffBadgeSourceProvider={handoffBadgeSourceProvider}
          handoffBadgeTargetProvider={handoffBadgeTargetProvider}
          gitCwd={threadWorkspaceCwd}
          diffTotals={repoDiffTotals}
          showGitActions={showGitActions && !isEditorRail}
          showDiffToggle={!isEditorRail}
          diffOpen={resolvedDiffOpen}
          diffDisabledReason={diffDisabledReason}
          rightDockOpen={rightDockOpen}
          {...(onToggleRightDock ? { onToggleRightDock } : {})}
          environment={isEditorRail ? null : environmentHeaderState}
          surfaceMode={surfaceMode}
          chatLayoutAction={
            surfaceMode === "single" && onSplitSurface
              ? {
                  kind: "split",
                  label: "Split chat",
                  shortcutLabel: chatSplitShortcutLabel,
                  onClick: onSplitSurface,
                }
              : surfaceMode === "split" && isFocusedPane && onMaximizeSurface
                ? {
                    kind: "maximize",
                    label: "Expand this chat",
                    shortcutLabel: null,
                    onClick: onMaximizeSurface,
                  }
                : null
          }
          editorChatControls={
            isEditorRail && activeProject
              ? {
                  projectId: activeProject.id,
                  activeSurface: terminalWorkspaceTerminalTabActive ? "terminal" : "chat",
                  terminalAvailable: terminalState.terminalOpen,
                  terminalHasRunningActivity: terminalState.runningTerminalIds.length > 0,
                  onNewChat: onNewEditorChat,
                  onNewTerminal: onOpenEditorTerminal,
                  onOpenChat: onOpenEditorChat,
                  onOpenTerminal: onOpenEditorTerminal,
                  onCloseTerminal: onCloseEditorTerminal,
                }
              : null
          }
          changeThreadAction={
            surfaceMode === "split" && isFocusedPane && onChangeThreadInSplitPane
              ? {
                  label: "Change thread",
                  onClick: onChangeThreadInSplitPane,
                }
              : null
          }
          onRunProjectScript={onRunProjectScriptFromHeader}
          onAddProjectScript={saveProjectScript}
          onUpdateProjectScript={updateProjectScript}
          onDeleteProjectScript={deleteProjectScript}
          onToggleDiff={onToggleDiff}
          onRegisterCommitAndPushTrigger={onRegisterCommitAndPushTrigger}
          onCreateHandoff={onCreateHandoffThread}
          onNavigateToThread={onNavigateToThread}
          onRenameThread={() => setRenameDialogOpen(true)}
          {...(onCloseThreadPane ? { onCloseThreadPane } : {})}
        />
      </header>

      {/* Floating find panel — a root-level overlay so it sits on top of the
          header and the docked Environment panel at the pane's top-right. */}
      {shouldRenderChatPaneContent ? (
        <ChatThreadFindHost
          open={threadFindOpen}
          focusNonce={threadFindFocusNonce}
          timelineEntries={timelineEntries}
          threadId={threadId}
          className={cn(
            terminalWorkspaceTerminalTabActive && "invisible",
            !isEditorRail && desktopTopBarWindowControlsGutterClassName,
          )}
          onClose={() => setThreadFindOpen(false)}
          onJump={handleThreadFindJump}
          onHighlightChange={threadFindHighlightStore.set}
          onActiveMatchChange={handleThreadFindActiveMatchChange}
        />
      ) : null}

      <RenameThreadDialog
        open={renameDialogOpen}
        currentTitle={activeThread.title}
        onOpenChange={setRenameDialogOpen}
        onSave={handleRenameActiveThread}
      />
      {automationDraftForm ? (
        <AutomationDialog
          open={automationDraftOpen}
          form={automationDraftForm}
          projects={automationProjects}
          threads={automationThreads}
          warnings={automationDraftWarnings}
          acknowledgedWarningIds={acknowledgedAutomationWarnings}
          onToggleWarning={toggleAutomationWarning}
          onOpenChange={setAutomationDraftDialogOpen}
          onFormChange={updateAutomationDraftForm}
          onSubmit={submitAutomationDraft}
          busy={isAutomationDraftSubmitting}
        />
      ) : null}

      {/* Thread-level errors render as a toast (see `useThreadErrorToast`) so they
          never displace the transcript. */}
      <ProviderHealthBanner
        status={shouldShowProviderHealthBanner ? visibleActiveProviderStatus : null}
        onDismiss={dismissActiveProviderHealthBanner}
      />
      <RateLimitBanner
        rateLimitStatus={visibleActiveRateLimitStatus}
        onDismiss={dismissActiveRateLimitBanner}
      />
      {terminalWorkspaceOpen && !isEditorRail ? (
        <TerminalWorkspaceTabs
          activeTab={terminalState.workspaceActiveTab}
          isWorking={isWorking}
          terminalHasRunningActivity={terminalState.runningTerminalIds.length > 0}
          terminalCount={terminalState.terminalIds.length}
          workspaceLayout={terminalState.workspaceLayout}
          onSelectTab={setTerminalWorkspaceTab}
        />
      ) : null}
      {/* Main content area with optional plan sidebar */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Chat column */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            aria-hidden={terminalWorkspaceTerminalTabActive}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              terminalWorkspaceTerminalTabActive ? "pointer-events-none invisible" : "",
            )}
          >
            {shouldRenderChatPaneContent && isCenteredEmptyLanding ? (
              <div
                className={cn(
                  "chat-pane-enter flex min-h-0 flex-1 flex-col",
                  CHAT_COLUMN_GUTTER_CLASS_NAME,
                )}
              >
                {/* The heading floats centered in the space above the composer, which is
                    anchored to the bottom of the pane (with its workspace-tools rail
                    stacked on top of the input) so starting a chat keeps the composer
                    where it lives for the rest of the conversation. */}
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <div
                    className={cn(
                      "flex flex-col items-center gap-4 px-6 text-center select-none",
                      CHAT_COLUMN_FRAME_CLASS_NAME,
                    )}
                  >
                    <ForkaraLogo aria-label="Forkara logo" className="size-10" />
                    <h2
                      data-testid="empty-landing-heading"
                      className="text-[26px] font-normal leading-[1.15] tracking-[-0.015em] text-foreground/95 sm:text-[30px]"
                    >
                      {isEmptyChatLanding ? (
                        "What should we work on?"
                      ) : (
                        <>
                          What should we do in{" "}
                          {showEmptyLandingProjectPicker ? (
                            <ProjectPicker
                              align="center"
                              side="bottom"
                              selectionMode="project"
                              selectedProjectId={activeProject.id}
                              selectedWorkspaceRoot={activeProject.cwd}
                              showResetToHome
                              onSelectProject={handleSelectProjectForEmptyDraft}
                              onCreateProjectFromPath={handleCreateProjectFromPickerPath}
                              onResetToHome={handleResetWorkspaceToHome}
                              renderTrigger={
                                <button
                                  type="button"
                                  data-testid="empty-landing-heading-project-trigger"
                                  className="cursor-pointer rounded-sm text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[6px] transition-colors duration-150 ease-out hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
                                >
                                  {activeProjectDisplayName ?? "this folder"}
                                </button>
                              }
                            />
                          ) : (
                            <span className="text-inherit">
                              {activeProjectDisplayName ?? "this folder"}
                            </span>
                          )}
                          ?
                        </>
                      )}
                    </h2>
                  </div>
                </div>
                <div className="w-full shrink-0 pb-3 sm:pb-4">
                  {composerSection}
                  {relocateComposerLeadingControls ? (
                    <div className={COMPOSER_COLUMN_FRAME_CLASS_NAME}>
                      <div className="flex w-full items-center gap-1">
                        <div className="flex shrink-0 items-center gap-1 pl-1">
                          {renderComposerLeadingControls({ iconOnly: true })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {shouldRenderChatPaneContent && !isCenteredEmptyLanding ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ChatTranscriptPane
                    activeThreadId={activeThread.id}
                    activeTurnId={activeTurnIdForTranscript}
                    agentActivityDetail={openAgentActivityDetail}
                    hasMessages={timelineEntries.length > 0}
                    isWorking={isWorking}
                    workingLabel={resolveWorkingLabel({
                      isSendBusy,
                      turnTakenOver,
                      isConnecting,
                      providerName: providerDisplayName,
                    })}
                    worktreeSetup={activeWorktreeSetup}
                    worktreeSetupPendingAction={worktreeSetupPendingAction}
                    onResolveWorktreeSetup={onResolveWorktreeSetup}
                    activeTurnInProgress={activeTurnInProgress}
                    activeTurnStartedAt={activeWorkStartedAt}
                    listRef={legendListRef}
                    timelineControllerRef={timelineControllerRef}
                    findHighlightStore={threadFindHighlightStore}
                    pinnedMessageIds={pinnedMessageIds}
                    canPinMessage={canPinMessage}
                    onTogglePinMessage={handleTogglePinMessageGuarded}
                    onForkFromMessage={handleForkFromMessage}
                    threadMarkers={threadMarkers}
                    goalAchievements={goalAchievements}
                    enteringUserMessageIds={enteringUserMessageIds}
                    tailAnchorMessageId={
                      tailAnchor !== null && tailAnchor.threadId === activeThread.id
                        ? tailAnchor.messageId
                        : null
                    }
                    tailAnchorScrollInFlightRef={tailAnchorScrollInFlightRef}
                    crossTaskOrigin={crossTaskOrigin}
                    forkSource={forkSource}
                    isTemporaryThread={isThreadTemporary}
                    timelineEntries={timelineEntries}
                    turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
                    onOpenTurnDiff={onOpenTurnDiff}
                    onOpenThread={onNavigateToThread}
                    onOpenAutomation={onOpenAutomation}
                    revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
                    onRevertUserMessage={onRevertUserMessage}
                    onUndoTurnFiles={onUndoTurnFiles}
                    onEditUserMessage={onEditUserMessage}
                    editableUserMessageId={editableUserMessageId}
                    isRevertingCheckpoint={isRevertingCheckpoint}
                    onExpandTimelineImage={onExpandTimelineImage}
                    followLiveOutput={hasStreamingAssistantText && !isUserScrollDetached}
                    onIsAtEndChange={onIsAtEndChange}
                    onNavigate={onTranscriptNavigate}
                    markdownCwd={threadWorkspaceCwd ?? undefined}
                    resolvedTheme={resolvedTheme}
                    chatFontSizePx={settings.chatFontSizePx}
                    timestampFormat={timestampFormat}
                    workspaceRoot={threadArtifactWorkspaceRoot ?? undefined}
                    emptyStateContent={transcriptEmptyStateContent}
                    emptyStateProjectName={activeProjectDisplayName}
                    terminalWorkspaceTerminalTabActive={terminalWorkspaceTerminalTabActive}
                    onMessagesScroll={onMessagesScroll}
                    onMessagesClickCapture={onMessagesClickCapture}
                    onMessagesMouseUp={onMessagesMouseUp}
                    onMessagesWheel={onMessagesWheel}
                    onMessagesPointerDown={onMessagesPointerDown}
                    onMessagesPointerUp={onMessagesPointerUp}
                    onMessagesPointerCancel={onMessagesPointerCancel}
                    onMessagesTouchStart={onMessagesTouchStart}
                    onMessagesTouchMove={onMessagesTouchMove}
                    onMessagesTouchEnd={onMessagesTouchEnd}
                    onOpenAgentActivity={setOpenAgentActivityId}
                    onCloseAgentActivityDetail={() => setOpenAgentActivityId(null)}
                    scrollButtonVisible={showScrollToBottom}
                    onScrollToBottom={onScrollToBottom}
                    contentInsetRightPx={
                      environmentAppliesContentInset
                        ? ENVIRONMENT_DOCKED_CONTENT_INSET_PX
                        : undefined
                    }
                    contentInsetBottomPx={composerTranscriptInsetPx}
                    contentInsetBottomClearancePx={composerOverlayBottomClearancePx}
                  />
                </div>

                {/* Trailing block below the transcript: the composer floats on top of it
                    (`bottom-full`), so the transcript's scroll viewport — and therefore every
                    row scrolling behind the frosted composer — is clipped at the composer's
                    bottom edge. Nothing ever shows through this gutter or the BranchToolbar row. */}
                <div className="relative z-10 w-full shrink-0">
                  <div
                    ref={composerOverlayRef}
                    className={cn(
                      "pointer-events-none absolute inset-x-0 bottom-full w-full overflow-visible",
                      ENVIRONMENT_CONTENT_INSET_MOTION_CLASS,
                      CHAT_COLUMN_GUTTER_CLASS_NAME,
                    )}
                    // Match the transcript's right inset so the composer stays aligned with chat
                    // content (and clear of the docked Environment overlay).
                    style={
                      environmentAppliesContentInset
                        ? { paddingRight: ENVIRONMENT_DOCKED_CONTENT_INSET_PX }
                        : undefined
                    }
                  >
                    <div className="pointer-events-auto">{composerSection}</div>
                  </div>
                  {/* A trailing BranchToolbar only renders for legacy git threads; otherwise the
                      composer is the last element, so give it a comfortable bottom margin. */}
                  <div
                    className={cn(isGitRepo && !environmentEnabled ? "pt-0.5" : "pt-3 sm:pt-4")}
                  />
                  {secondaryChromeReady &&
                  ((isGitRepo && !environmentEnabled) || relocateComposerLeadingControls) ? (
                    <div className={CHAT_COLUMN_GUTTER_CLASS_NAME}>
                      <div className={COMPOSER_COLUMN_FRAME_CLASS_NAME}>
                        <div className="flex w-full items-center gap-1">
                          {relocateComposerLeadingControls ? (
                            <div className="flex shrink-0 items-center gap-1 pl-1">
                              {renderComposerLeadingControls({ iconOnly: true })}
                            </div>
                          ) : null}
                          {isGitRepo && !environmentEnabled ? (
                            <BranchToolbar {...branchToolbarProps} className="min-w-0 flex-1" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {shouldRenderChatPaneContent && secondaryChromeReady && pullRequestDialogState ? (
              <PullRequestThreadDialog
                key={pullRequestDialogState.key}
                open
                cwd={threadArtifactWorkspaceRoot}
                initialReference={pullRequestDialogState.initialReference}
                onOpenChange={(open) => {
                  if (!open) {
                    closePullRequestDialog();
                  }
                }}
                onPrepared={handlePreparedPullRequestThread}
              />
            ) : null}
          </div>

          {terminalWorkspaceOpen ? (
            <div
              aria-hidden={!terminalWorkspaceTerminalTabActive}
              className={cn(
                "absolute inset-0 min-h-0 min-w-0 transition-all duration-200 ease-out",
                terminalWorkspaceTerminalTabActive
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0",
              )}
            >
              <Suspense fallback={null}>
                <ThreadTerminalDrawer
                  key={`${activeThread.id}-workspace`}
                  {...terminalDrawerProps}
                  presentationMode="workspace"
                  isVisible={terminalWorkspaceTerminalTabActive}
                  onTogglePresentationMode={
                    terminalState.workspaceLayout === "both" ? collapseTerminalWorkspace : undefined
                  }
                />
              </Suspense>
            </div>
          ) : null}

          {/* Environment overlay — always mounted so open/close can transition in lockstep with inset. */}
          {environmentEnabled ? (
            <EnvironmentPanel
              {...environmentPanelProps}
              open={environmentPanelVisible}
              variant={environmentOverlayVariant}
              bottomInsetPx={environmentPanelBottomInsetPx(
                composerOverlayHeightPx,
                composerOverlayAnchorGapPx,
              )}
            />
          ) : null}
        </div>
        {/* end chat column */}

        {/* Plan sidebar */}
        {planSidebarOpen ? (
          <PlanSidebar
            activeTaskList={activeTaskList}
            activeProposedPlan={sidebarProposedPlan}
            markdownCwd={threadWorkspaceCwd ?? undefined}
            workspaceRoot={threadArtifactWorkspaceRoot ?? undefined}
            timestampFormat={timestampFormat}
            onClose={() => {
              setPlanSidebarOpen(false);
              // Track that the user explicitly dismissed for this turn so auto-open won't fight them.
              const turnKey = activeTaskList?.turnId ?? sidebarProposedPlan?.turnId ?? null;
              if (turnKey) {
                planSidebarDismissedForTurnRef.current = turnKey;
              }
            }}
          />
        ) : null}
      </div>
      {/* end horizontal flex container */}

      {(() => {
        if (!terminalState.terminalOpen || terminalWorkspaceOpen) {
          return null;
        }
        return (
          <Suspense fallback={null}>
            <ThreadTerminalDrawer
              key={activeThread.id}
              {...terminalDrawerProps}
              presentationMode="drawer"
              onTogglePresentationMode={expandTerminalWorkspace}
            />
          </Suspense>
        );
      })()}

      <ComposerSlashStatusDialog
        open={isSlashStatusDialogOpen}
        onOpenChange={setIsSlashStatusDialogOpen}
        selectedModel={selectedModel}
        fastModeEnabled={fastModeEnabled}
        selectedPromptEffort={selectedPromptEffort}
        interactionMode={interactionMode}
        envMode={envMode}
        envState={envState}
        branch={activeThread?.branch ?? activeRootBranch}
        contextWindow={activeContextWindow}
        cumulativeCostUsd={activeCumulativeCostUsd}
        rateLimitStatus={activeRateLimitStatus}
        activeContextWindowLabel={contextWindowSelectionStatus.activeLabel}
        pendingContextWindowLabel={contextWindowSelectionStatus.pendingSelectedLabel}
      />
      <ThreadWorktreeHandoffDialog
        open={worktreeHandoffDialogOpen}
        worktreeName={worktreeHandoffName}
        busy={handoffBusy}
        onWorktreeNameChange={setWorktreeHandoffName}
        onOpenChange={setWorktreeHandoffDialogOpen}
        onConfirm={confirmWorktreeHandoff}
      />
      {isInactiveSplitPane ? null : (
        <TranscriptSelectionActionLayer
          action={pendingTranscriptSelectionAction}
          onHighlight={createHighlightFromPendingSelection}
          onUnderline={createUnderlineFromPendingSelection}
          onAddToChat={commitTranscriptAssistantSelection}
        />
      )}
      <ExpandedImageOverlay
        expandedImage={expandedImage}
        onClose={closeExpandedImage}
        onNavigate={navigateExpandedImage}
      />
    </div>
  );
}
