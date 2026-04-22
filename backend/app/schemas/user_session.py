from pydantic import BaseModel, Field


class ActiveSessionRead(BaseModel):
    id: int = Field(..., description="Session row ID")
    user_id: str = Field(..., description="User UUID")
    session_id: str = Field(..., description="Session UUID")
    started_at: str | None = Field(None, description="Session start ISO timestamp")
    last_heartbeat: str | None = Field(None, description="Last heartbeat ISO timestamp")
    ip_address: str | None = Field(None, description="Client IP address")
    city: str | None = Field(None, description="City resolved from IP")
    user_agent: str | None = Field(None, description="Browser user-agent string")
    branch_id: int | None = Field(None, description="Branch ID during this session")
    branch_name: str | None = Field(None, description="Branch name during this session")
    route_id: int | None = Field(None, description="Route ID assigned to user")
    latitude: float | None = Field(None, description="IP geolocation latitude")
    longitude: float | None = Field(None, description="IP geolocation longitude")
    isp: str | None = Field(None, description="Internet service provider")
    portal: str | None = Field(None, description="Which portal created the session: 'admin' for admin.carferry.online, NULL for replicated production sessions")
    full_name: str = Field(..., description="User full name")
    username: str = Field(..., description="Username")
    role: str = Field(..., description="User role")
    ticket_count: int | None = Field(None, description="Tickets generated/verified during session (billing ops/checkers only)")


class SessionHistoryRead(ActiveSessionRead):
    ended_at: str | None = Field(None, description="Session end ISO timestamp")
    end_reason: str | None = Field(None, description="How session ended: logout, idle_timeout, login_elsewhere")


class ActivitySummary(BaseModel):
    action_type: str = Field(..., description="Activity action type")
    count: int = Field(..., description="Number of times this action occurred")
