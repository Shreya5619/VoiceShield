# Requirements Document: Real-Time Transcription Web App

## Introduction

The Real-Time Transcription Web App is a web-based application that enables users to capture audio input and receive live transcription through a secure WebSocket connection. The system authenticates users via pre-signed WebSocket URLs, generates temporary credentials using AWS Lambda, and provides a modern frontend interface built with Vite. The application prioritizes real-time performance, security through credential expiration, and seamless audio streaming.

## Glossary

- **Frontend**: The user-facing web application built with Vite and JavaScript/TypeScript that captures audio and displays transcriptions
- **WebSocket Server**: The backend service that maintains persistent connections and manages audio stream processing
- **Credential Service**: An AWS Lambda function that generates temporary authentication credentials for WebSocket connections
- **Pre-signed URL**: A time-limited, authenticated URL that includes embedded credentials for WebSocket authentication
- **Audio Stream**: Continuous audio data transmitted from the Frontend to the WebSocket Server
- **Transcription**: Text output produced by the transcription service based on the Audio Stream
- **Session**: A period of time during which a user maintains an authenticated connection and audio stream
- **Session Token**: A temporary credential issued by the Credential Service for authenticating a WebSocket connection

## Requirements

### Requirement 1: Pre-Signed WebSocket URL Generation

**User Story:** As a frontend application, I want to request pre-signed WebSocket URLs with embedded credentials, so that I can establish authenticated WebSocket connections without exposing long-lived secrets.

#### Acceptance Criteria

1. WHEN the Frontend requests a pre-signed URL, THE Credential Service SHALL generate a unique Session Token valid for a configurable duration (default: 15 minutes)
2. THE Credential Service SHALL include the Session Token in the pre-signed URL as a query parameter
3. WHEN a Session Token is generated, THE Credential Service SHALL record the token's creation timestamp and expiration time
4. THE pre-signed URL SHALL include the WebSocket Server endpoint and the Session Token parameter
5. WHEN the pre-signed URL is returned, THE Credential Service SHALL return it within 500 milliseconds

### Requirement 2: WebSocket Authentication via Pre-Signed URLs

**User Story:** As a WebSocket Server, I want to validate pre-signed URLs during connection initiation, so that only authorized clients can establish audio streams.

#### Acceptance Criteria

1. WHEN a WebSocket connection attempt is made, THE WebSocket Server SHALL extract the Session Token from the URL query parameter
2. IF the Session Token is missing, THEN THE WebSocket Server SHALL reject the connection with a 401 Unauthorized response
3. IF the Session Token is invalid or expired, THEN THE WebSocket Server SHALL reject the connection with a 401 Unauthorized response
4. WHEN a valid Session Token is presented, THE WebSocket Server SHALL establish the WebSocket connection
5. WHEN a WebSocket connection is established, THE WebSocket Server SHALL log the connection event with the associated Session Token identifier

### Requirement 3: Lambda Credential Generation

**User Story:** As a system, I want to generate temporary credentials through AWS Lambda, so that credentials expire automatically and limit exposure of long-lived secrets.

#### Acceptance Criteria

1. THE Credential Service SHALL be implemented as an AWS Lambda function
2. WHEN the Lambda function is invoked, THE Credential Service SHALL generate a cryptographically secure random Session Token
3. THE Credential Service SHALL store Session Token metadata (creation time, expiration time, client identifier) for validation
4. WHERE credential storage is configured as DynamoDB, THE Credential Service SHALL write token metadata to DynamoDB with a Time-to-Live (TTL) attribute set to the expiration time
5. WHEN Session Token metadata is written to storage, THE Credential Service SHALL include an audit log entry with the client identifier and timestamp
6. IF the Lambda function encounters an error during token generation, THEN THE Credential Service SHALL return an HTTP 500 error with a descriptive error message

### Requirement 4: Session Token Expiration

**User Story:** As a security component, I want Session Tokens to expire after a set duration, so that compromised tokens have a limited window of usability.

#### Acceptance Criteria

1. WHEN a Session Token is generated, THE Credential Service SHALL set its expiration time to the current time plus the configured token lifetime
2. WHEN the WebSocket Server validates a Session Token, THE WebSocket Server SHALL compare the current time to the token's expiration time
3. IF the current time is past the token's expiration time, THEN THE WebSocket Server SHALL reject the connection with a 401 Unauthorized response
4. WHERE DynamoDB storage is used, THE Credential Service SHALL configure a TTL attribute on token records so that expired tokens are automatically deleted
5. THE default Session Token lifetime SHALL be 15 minutes and SHALL be configurable via environment variables

### Requirement 5: Audio Stream Capture and Transmission

**User Story:** As a Frontend, I want to capture audio from the user's microphone and transmit it in real time over the WebSocket connection, so that the transcription service can process audio with minimal latency.

#### Acceptance Criteria

1. WHEN the user initiates recording, THE Frontend SHALL request user permission to access the microphone
2. IF the user denies microphone permission, THEN THE Frontend SHALL display an error message and not attempt to establish a WebSocket connection
3. WHEN microphone permission is granted, THE Frontend SHALL open a WebSocket connection using the pre-signed URL
4. WHEN the user starts speaking, THE Frontend SHALL capture audio in real-time chunks (recommended: 100ms chunks) and transmit each chunk over the WebSocket connection
5. THE Frontend SHALL encode audio chunks in a specified format (e.g., PCM, Opus) before transmission
6. WHEN the user stops recording, THE Frontend SHALL send a stop signal to the WebSocket Server and close the WebSocket connection
7. WHILE audio is being streamed, THE Frontend SHALL display a visual indicator showing that audio capture is in progress

### Requirement 6: Real-Time Transcription Reception

**User Story:** As a Frontend, I want to receive transcription results in real time as audio is being processed, so that users see live transcription updates.

#### Acceptance Criteria

1. WHEN the WebSocket Server receives an audio chunk from the Frontend, THE WebSocket Server SHALL forward it to the transcription service
2. WHEN the transcription service returns transcription results, THE WebSocket Server SHALL transmit the results back to the Frontend over the WebSocket connection
3. WHEN the Frontend receives transcription results, THE Frontend SHALL append them to the transcription display in real-time
4. WHEN a new sentence or phrase boundary is detected, THE Frontend SHALL display intermediate results with visual differentiation
5. THE Frontend SHALL maintain a transcript history that persists for the duration of the Session

### Requirement 7: Vite Frontend Build and Development

**User Story:** As a developer, I want a modern frontend build toolchain, so that I can develop efficiently with hot module replacement and optimized production builds.

#### Acceptance Criteria

1. THE Frontend SHALL use Vite as the build tool and development server
2. WHEN the development server is started, THE Frontend SHALL support hot module replacement (HMR) for rapid feedback during development
3. WHEN a production build is executed, THE Frontend SHALL generate optimized, minified JavaScript and CSS bundles
4. THE Frontend build configuration SHALL target modern browsers (ES2020 or later)
5. WHEN the Frontend is built for production, THE Frontend SHALL generate source maps for debugging
6. THE Frontend project SHALL include a `vite.config.js` configuration file with appropriate build settings

### Requirement 8: WebSocket Connection Management

**User Story:** As a WebSocket Server, I want to manage connection lifecycle events, so that resources are properly cleaned up when connections end.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established, THE WebSocket Server SHALL track the connection in an active connections registry
2. WHEN a user manually closes the WebSocket connection, THE WebSocket Server SHALL remove the connection from the active connections registry
3. WHEN a WebSocket connection is idle for longer than a configurable timeout (default: 5 minutes), THE WebSocket Server SHALL close the connection and remove it from the registry
4. WHEN a WebSocket connection is closed, THE WebSocket Server SHALL log the disconnection event with the connection duration and amount of audio processed
5. IF an error occurs on an active WebSocket connection, THEN THE WebSocket Server SHALL close the connection gracefully and log the error

### Requirement 9: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when issues occur, so that I understand what went wrong and how to resolve it.

#### Acceptance Criteria

1. IF a WebSocket connection fails, THEN THE Frontend SHALL display an error message indicating the cause (e.g., "Connection expired, please refresh and try again")
2. IF the transcription service is unavailable, THEN THE WebSocket Server SHALL send an error notification to the Frontend
3. WHEN the Frontend receives an error notification, THE Frontend SHALL display it to the user and provide an option to retry or start a new session
4. IF a network error occurs during audio transmission, THEN THE Frontend SHALL attempt to reconnect using an exponential backoff strategy (initial delay: 1 second, max delay: 30 seconds)
5. WHEN a reconnection attempt succeeds, THE Frontend SHALL inform the user that the connection has been restored

### Requirement 10: Security and Access Control

**User Story:** As a system administrator, I want the transcription web app to enforce authentication and access control, so that only authorized users can access the transcription service.

#### Acceptance Criteria

1. WHERE client authentication is enabled, THE Frontend SHALL include client credentials in the pre-signed URL request
2. THE Credential Service SHALL validate client credentials before issuing a Session Token
3. IF client credentials are invalid, THEN THE Credential Service SHALL reject the request and return an HTTP 401 Unauthorized response
4. THE WebSocket Server SHALL validate that the Session Token was legitimately issued by the Credential Service
5. WHEN a Session Token is validated, THE WebSocket Server SHALL use cryptographic verification to ensure the token has not been tampered with

