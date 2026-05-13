# Kigazine: messages + magazine photos

This branch is reserved for adding:

1. Direct user-to-user messaging stored in Firestore.
2. Magazine image support.

## Intended data model

### Messages
Collection: `messages`

Each document:
- `fromUid`
- `fromUsername`
- `toUid`
- `toUsername`
- `text`
- `createdAt`
- `participants` array containing both UIDs

### Magazine photos
Each magazine document can include:
- `imageUrl` for an externally hosted image URL
- Later upgrade: `imageStoragePath` if Firebase Storage uploads are enabled

## Notes

The current app already includes auth, Firestore-backed magazines, profiles, people/friend-related UI, and comments. This branch is the safe place to finish and test the messaging/photos patch before merging into `main`.
