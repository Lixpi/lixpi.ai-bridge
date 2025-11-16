# Lixpi NATS Service

Shared NATS client implementation for both Python and TypeScript services.

Provides a unified API for NATS messaging with support for:
- Connection management with automatic reconnection
- Publish/subscribe patterns
- Request/reply patterns
- Queue groups for load balancing
- Optional self-issued JWT authentication via NKeys

## Structure

```
packages/lixpi/nats-service/
├── js/                      # TypeScript/JavaScript package
│   ├── nats-service.ts      # Main implementation
│   └── package.json
├── python/                  # Python package
│   ├── __init__.py
│   ├── nats_client.py       # Main implementation
│   └── pyproject.toml
└── README.md
```

## Usage

### TypeScript

```typescript
import NatsService, { generateSelfIssuedJWT } from '@lixpi/nats-service'
import type { NatsServiceConfig } from '@lixpi/nats-service'

// Basic authentication with token
const config: NatsServiceConfig = {
    servers: ['nats://localhost:4222'],
    name: 'my-service',
    token: 'your-token'
}

// Or with self-issued JWT (for services that require it)
const configWithJWT: NatsServiceConfig = {
    servers: ['nats://nats.example.com:4222'],
    name: 'llm-service',
    nkeySeed: process.env.NATS_NKEY_SEED,
    userId: 'svc:llm-service'
}

// Initialize and connect
const natsService = await NatsService.init(config)

// Publish
natsService.publish('subject.name', { message: 'hello' })

// Subscribe
await natsService.subscribe(
    'subject.name',
    async (data, msg) => {
        console.log('Received:', data)
    },
    { queue: 'workers' }  // Optional queue group
)

// Request/reply
const response = await natsService.request('subject.name', { query: 'data' })

// Reply handler
await natsService.reply(
    'subject.name',
    async (data, msg) => {
        return { result: 'processed' }
    },
    { queue: 'workers' }
)

// Disconnect
await natsService.disconnect()
```

### Python

```python
from lixpi_nats_service import NatsService, NatsServiceConfig, generate_self_issued_jwt

# Basic authentication with token
config = NatsServiceConfig(
    servers=["nats://localhost:4222"],
    name="my-service",
    token="your-token"
)

# Or with self-issued JWT (for services that require it)
config_with_jwt = NatsServiceConfig(
    servers=["nats://nats.example.com:4222"],
    name="llm-service",
    nkey_seed=os.environ["NATS_NKEY_SEED"],
    user_id="svc:llm-service",
    tls_ca_cert="/path/to/ca.crt"  # Optional TLS CA certificate
)

# Initialize and connect
nats_service = await NatsService.init(config)

# Publish
nats_service.publish("subject.name", {"message": "hello"})

# Subscribe
async def message_handler(data, msg):
    print(f"Received: {data}")

await nats_service.subscribe(
    "subject.name",
    message_handler,
    queue="workers"  # Optional queue group
)

# Request/reply
response = await nats_service.request("subject.name", {"query": "data"})

# Reply handler
async def reply_handler(data, msg):
    return {"result": "processed"}

await nats_service.reply(
    "subject.name",
    reply_handler,
    queue="workers"
)

# Disconnect
await nats_service.disconnect()
```

## Self-Issued JWT Authentication

Some services (like `llm-api`) use self-issued JWT authentication with NKeys for enhanced security. This is optional and only needed for specific deployment scenarios.

### How it works:

1. Service has an NKey seed (secret key)
2. On connection, service generates a JWT signed with its NKey
3. JWT includes service identity (e.g., `svc:llm-service`)
4. NATS server validates the JWT using the service's public key

### TypeScript Example:

```typescript
import { generateSelfIssuedJWT } from '@lixpi/nats-service'

const jwt = generateSelfIssuedJWT(
    nkeySeed: 'SU...',           // Your NKey seed
    userId: 'svc:my-service',    // Service identity
    expiryHours: 1               // Token validity (default: 1 hour)
)

const config = {
    servers: ['nats://nats.example.com:4222'],
    nkeySeed: process.env.NATS_NKEY_SEED,
    userId: 'svc:my-service'
}
```

### Python Example:

```python
from lixpi_nats_service import generate_self_issued_jwt

jwt = generate_self_issued_jwt(
    nkey_seed='SU...',           # Your NKey seed
    user_id='svc:my-service',    # Service identity
    expiry_hours=1               # Token validity (default: 1 hour)
)

config = NatsServiceConfig(
    servers=["nats://nats.example.com:4222"],
    nkey_seed=os.environ["NATS_NKEY_SEED"],
    user_id="svc:my-service"
)
```

## Configuration Options

### Common Options (both languages)

- `servers`: List of NATS server URLs (default: `["nats://localhost:4222"]`)
- `name`: Client name for identification
- `token`: Authentication token
- `user`/`password` (or `pass` in TS): Basic authentication
- `nkey_seed`/`nkeySeed`: NKey seed for self-issued JWT
- `user_id`/`userId`: User ID for JWT subject (used with `nkey_seed`)

### Python-specific Options

- `tls_ca_cert`: Path to TLS CA certificate
- `max_reconnect_attempts`: Maximum reconnection attempts (-1 for infinite)
- `reconnect_time_wait`: Wait time between reconnections in seconds

### TypeScript-specific Options

- `webSocket`: Use WebSocket transport instead of TCP
- `subscriptions`: Pre-configure subscriptions on connection
- `middleware`: Global message middleware
- `replyMiddleware`: Middleware for reply handlers

## Features

### Connection Management

- Automatic reconnection with configurable retry
- Connection status monitoring
- Graceful shutdown with drain

### Messaging Patterns

- **Publish**: Fire-and-forget messages
- **Subscribe**: Receive messages on a subject
- **Request/Reply**: Synchronous request-response pattern
- **Queue Groups**: Load balancing across multiple subscribers

### Payload Types

- JSON (default): Automatic encoding/decoding
- Buffer: Raw byte data

## Authentication Methods

1. **Token**: Simple token-based auth
2. **User/Password**: Basic authentication
3. **Self-Issued JWT**: Advanced authentication with NKeys (optional, for specific services)

## Examples

See the respective service implementations for real-world usage:
- TypeScript: `services/api/src/NATS/`
- Python: `services/llm-api/src/` (uses self-issued JWT)
