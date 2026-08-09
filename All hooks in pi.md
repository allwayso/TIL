## lifecycle overview

 ```
   pi starts
     ├─► project_trust
     ├─► session_start
     └─► resources_discover
         │
         ▼
   user sends prompt ─────────────────────────────────────────┐
     ├─► input
     ├─► before_agent_start
     ├─► agent_start
     ├─► message_start / message_update / message_end
     │   ┌─── turn ───┐
     │   │  turn_start
     │   │  context
     │   │  before_provider_headers
     │   │  before_provider_request
     │   │  after_provider_response
     │   │  tool_execution_start → tool_call → tool_result → tool_execution_end
     │   └─ turn_end ──┘
     ├─► agent_end
     └─► agent_settled
 ```