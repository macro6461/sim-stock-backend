# Changelog

This file tracks released versions with the changes made to this project.

## Version 1.0.6

### Added

- Built more robust message handling for web sockets, including json data to allow for pre-seeded answers for questions.
- Using `string-similarity-js` to evaluate which question/answer combo most closely relates to the message from the ChatWindow.

## Version 1.0.4

### Added

- Added jwt key verification in registration request.
- Improved error handling.
- Added `email` as a requirement for `User` schema as the sign in will now offer either Google OAuth or signing in/registering with email and password.
    - Username will be generated from the provided email.

## Version 1.0.3

### Added

- Added API request for Google OAuth.
- Added API logic to support WebSockets.

## Version 1.0.2

### Added

- Including `username` in JWT token signing and verification response.

## Version 1.0.1

### Added

- Added MIT License (can be found at `LICENSE`).

## Version 1.0.0

### Added

- First commit! Able to communicate from my SimStock React App to my local MongoDB insatance.
- Can create a user (register), authenticate an existing user (login) and can verify JWT tokens.