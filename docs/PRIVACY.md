# Privacy

The MVP is designed not to store user input or behavioral data.

## No Default Storage

- Municipality search terms are not persisted.
- Search history is not stored.
- IP address, user agent, and referer are not stored in application-owned storage.
- Analytics, ads, tracking tags, and error-reporting SDKs are not included.

## Browser Storage

The MVP does not use localStorage, sessionStorage, or cookies.

## Future Storage

If saved searches or history are added later, they must be opt-in and documented before release.
