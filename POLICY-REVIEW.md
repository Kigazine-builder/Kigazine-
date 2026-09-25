# Kigazine policy review checklist

These HTML pages are drafts, not legal advice or a claim of compliance. Do not present them as final until the issues below are resolved.

- Replace `[OPERATOR LEGAL NAME]`, `[PUBLIC POSTAL ADDRESS]`, `[PUBLIC PHONE]`, `[PUBLIC PRIVACY EMAIL]` and both effective-date placeholders with verified public details.
- Decide which ages can create accounts and put in place direct parental notice and a suitable verifiable parental-consent mechanism where required. A child's permission checkbox is not verification. Review what is legally required for the actual countries where Kigazine is offered.
- Fix the `users` Firestore read rule: it currently permits all signed-in users to read profile documents containing email addresses. Move publicly readable nickname/series data to separate safe profiles and migrate existing members before restricting the private `users` documents.
- Decide a retention schedule, account/parent data-access and deletion procedure, and log handling; implement the procedures rather than only promising them.
- Audit actual providers, their settings and data flows (Firebase, Vercel, EmailJS, OpenAI, any remaining analytics/ads) and confirm what is deployed. This branch removes Google Analytics from the main `index.html`, but that does not prove every page or prior deployment is tracker-free.
- Review whether images need automatic metadata stripping and whether messaging or public profile images should remain available to young accounts.
- After filling verified details and fixing the privacy/consent gaps, obtain legal review for the operator's jurisdiction and publish both pages with appropriate direct notices. Do not treat the new HTML pages as a substitute for these actions.

Relevant primary guidance: [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) (notably sections C and I) and [FTC Children's Privacy](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy).
