# Hunter email scoring for Kigazine signup

The site accepts a new email only when Hunter's Email Verifier returns an integer `score > 60`, a non-`invalid` status, and a non-disposable result. A score of 60 is rejected. Hunter assigns webmail addresses (including Gmail) an arbitrary score of 50, so this exact policy blocks those new signups even if the address is deliverable.

## Release order

1. Deploy `api/verify-email.js` to the Vercel project serving `https://kigazine-kn7i.vercel.app`. It returns HTTP 503 until configured. Verify that the endpoint exists (a GET with the site's Origin header returns 405) and that the route is not rewritten by another host rule.
2. In **that Vercel project**, set `HUNTER_API_KEY` as a sensitive Production environment variable and redeploy the API. A secret stored under GitHub Settings → Secrets and variables is available to GitHub Actions only; it is not automatically available to Vercel Functions. Never place the key in browser JavaScript or a GitHub Pages build artifact.
3. Test the endpoint from the allowed origin with non-personal test addresses. Confirm `score > 60` permits signup, `score <= 60` rejects it, 202/222/error responses block signup and invite retry, and the key never appears in responses or site source.
4. Only then publish the updated `index.html` and `privacy.html` to GitHub Pages. Publishing the client first would block every new signup while the endpoint or key is missing.

The public endpoint spends Hunter verification credits when called. It limits repeated requests per IP within one warm Vercel instance, but that is not a shared or attacker-resistant quota. Set a project-level rate or spend limit before using a paid key at scale. Hunter receives the signup email address. The privacy draft includes that disclosure and still requires operator review before it can be considered complete.

**Security boundary:** This browser-side precheck is a signup user-experience gate. A person can still call Firebase Authentication's public `createUserWithEmailAndPassword` directly and attempt Firestore profile creation under the current rules. Enforcing a Hunter score against bypasses needs a trusted server to approve accounts and a Firestore/Authentication policy that denies unapproved accounts. Do not describe this as server-enforced signup security.

Run `node --test tests/verify-email.test.js` before release.
