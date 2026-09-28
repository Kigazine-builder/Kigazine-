# Kigazine JavaScript security rollout

The main site remains static. Authenticated JavaScript Cloud Functions perform member lookup, friend changes, magazine submissions, and comment submissions. Firestore rules keep private profiles and submission cooldowns unavailable to ordinary browser reads and writes. Firebase Authentication is still the sign-in provider.

## Release order

Run these commands with an authorized Firebase account for project `kigazine-302ac`. Deploy in this order so the live browser never calls a missing function and the old browser is not blocked by the new rules:

1. From this repository, run `firebase use kigazine-302ac` and `firebase deploy --only functions:getMemberDirectory,functions:lookupMember,functions:changeFriend,functions:submitMagazine,functions:submitComment`. Keep the existing moderation functions deployed and the `OPENAI_API_KEY` secret available to them.
2. Publish the updated `index.html` and `messages.js` through the site's normal GitHub Pages or hosting release process. Check sign-in, member search, friend add/remove, magazine submission, comment submission, and moderator review with test accounts.
3. Run `firebase deploy --only firestore:rules`. Verify that a normal user can read only their own `users/{uid}` document, cannot directly create `magazines` or `comments`, and can still submit both through the functions. Test a non-discoverable member and a friends-only writer.

Do not deploy the new rules before step 2; the old client would lose its submission and directory paths. The security boundary takes effect when step 3 completes. Cloud Functions use the Admin SDK, which bypasses Firestore client security rules, so the callable functions must always authorize the caller and validate each write.

## Local checks

Run `node --test functions/kigazine-core.test.js` and `node validate-firestore-rules.mjs`. These cover input filtering and structural rule checks; use a Firebase test project or the Firestore emulator for full client/role integration before production rollout.

## Follow-up scope

This change secures the main magazine and comment write paths and the private member directory. Other direct Firestore paths (including reports, group chat, and Apple Times) still depend on their existing Firestore rules. The separate Vercel `/api/chat` endpoint still needs its own authentication and request limits. These endpoints are outside this rollout.
