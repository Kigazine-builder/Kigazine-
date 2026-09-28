# Kigazine security rollout on Firebase Spark

The live site uses GitHub Pages at `kigazine.com` and the Firebase project is currently on the no-cost Spark plan. Spark cannot deploy Cloud Functions. The JavaScript callable functions in `functions/` are prepared for a future Blaze rollout, but must not be used by the live client yet.

## Release order

1. Publish `index.html` and `messages.js` to GitHub Pages. Verify the live HTML no longer imports `firebase-functions.js` and that users can sign in, find members, add people to their own friends list, submit posts and comments, and send messages to discoverable members.
2. Deploy `firestore.rules` to project `kigazine-302ac` using the Firebase console or `firebase deploy --only firestore:rules`. Keep the school and Apple Times rules intact. Test a regular account and an admin after publishing.

The rules validate submitted fields, bind usernames and timestamps to authenticated accounts, require mutual friendship for friends-only comments, and restrict messages to discoverable or mutually befriended recipients. A user can change only their own friends list; the other person must add them independently for mutual friendship.

**Remaining privacy gap:** Existing `users/{uid}` documents include email addresses and are readable by signed-in regular users because the directory and username lookup are entirely client-side. Do not claim profile privacy from this rollout. Migrate directory data to a separate public collection and update the client before restricting reads to owner/admin, or upgrade to Blaze and deploy the authenticated callable functions first. The callable rollout in PR #11 is unsafe to publish on Spark because it depends on functions that cannot be deployed.

To roll out the callable backend later, deploy the functions before switching the client, and deploy its stricter rules only after the new client works. This requires a billing-plan upgrade performed by the project owner. Existing moderation functions and their secrets must remain available when deploying.
