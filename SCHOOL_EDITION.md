# Kigazine School Edition — pilot foundation

This branch establishes the server-enforced security model for the supervised
school pilot proposed to SAS China.

## Pilot boundaries

- School accounts are separate from regular Kigazine profiles.
- School participant records contain a nickname, role, school ID, and active
  status. They do not store email addresses.
- A Kigazine administrator provisions the first school, school administrator,
  teacher, class, and participants.
- Private messages and regular Kigazine posting are blocked for active school
  participants.
- School profile-photo uploads are blocked because school accounts cannot create
  or update regular `users` profiles.
- School magazines remain class-only.
- A student can create a draft or submit it.
- Only an assigned teacher or school administrator can approve, reject, or
  request changes.
- An approved magazine is readable only by active members of its class.

## Collections

| Collection | Purpose |
| --- | --- |
| `schools` | School workspace configuration |
| `schoolParticipants` | Private nickname-only school roles |
| `schoolClasses` | Classes and assigned moderator UIDs |
| `schoolClassMembers` | Class enrollment, keyed as `classId_uid` |
| `schoolMagazines` | Draft, submitted, and reviewed class magazines |
| `schoolReports` | Student safety reports |
| `schoolAuditLogs` | Append-only adult moderation events |

## Roles

- `student`: creates drafts and submits magazines.
- `teacher`: moderates only classes listing their UID in
  `moderatorUids`.
- `school_admin`: manages all classes in their school.
- Existing Kigazine `admin` users provision and deactivate pilot workspaces.

## Magazine state machine

```text
draft -> submitted -> approved
                   -> rejected
                   -> changes_requested -> draft -> submitted
```

Students cannot set `approved`, `rejected`, `reviewedBy`, or publication
timestamps. Moderators cannot silently alter student content while reviewing;
their write is limited to review fields.

## Required provisioning order

1. Create Firebase Authentication accounts for the approved adults and students.
2. Create the `schools/{schoolId}` document.
3. Create nickname-only `schoolParticipants/{uid}` documents.
4. Create `schoolClasses/{classId}` with at least one assigned moderator UID.
5. Create `schoolClassMembers/{classId_uid}` documents.
6. Open the School Edition interface only after an adult moderator is assigned.

Do not create regular `users/{uid}` documents for school-only pilot accounts.
This prevents their authentication email from entering Kigazine's member
directory.

## Deployment requirement

Merging this repository change does not deploy Firestore rules by itself. Deploy
the reviewed rules to Firebase project `kigazine-302ac` before running the
pilot, then test the student and moderator paths with separate accounts.

