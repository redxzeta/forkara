# X integration

Forkara can connect one X account for explicit, user-reviewed text posts. The web app never calls X
directly, and Forkara does not schedule or publish posts automatically.

## Configure an OAuth app

1. Create an X OAuth 2.0 app that supports Authorization Code with PKCE.
2. Set the compatibility variable `FORKARA_X_CLIENT_ID` to the app's public client ID before starting
   Forkara. This name is retained so existing installations and automation keep working.
3. In **Settings → Social accounts**, copy the callback URI shown by Forkara and register that exact
   URI in the X developer app.
4. Select **Connect X account** and complete the user-driven authorization in the browser.

Forkara requests `tweet.read`, `tweet.write`, `users.read`, and `offline.access`. The last scope lets
Forkara refresh the local connection across restarts. Access and refresh tokens are stored only in
Forkara's private local secret store; the PKCE state and verifier stay in memory and expire after ten
minutes. If the server restarts during authorization, start the connection again.

Disconnecting removes the credential owned by Forkara. It does not revoke unrelated X sessions or
change the account. Posting supports text only; media upload, replies, direct messages, likes,
follows, scheduling, and autonomous posting are intentionally unavailable.

Protocol details follow X's official [OAuth 2.0 PKCE guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
and [create-Post quickstart](https://docs.x.com/x-api/posts/manage-tweets/quickstart).
