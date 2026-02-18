from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    BILLING_OPERATOR = "billing_operator"
    TICKET_CHECKER = "ticket_checker"


# Menu items visible per role (used by frontend navigation)
ROLE_MENU_ITEMS: dict[UserRole, list[str]] = {
    UserRole.SUPER_ADMIN: [
        "Dashboard",
        "User Management",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Payments",
        "Reports",
        "System Settings",
    ],
    UserRole.ADMIN: [
        "Dashboard",
        "User Management",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Payments",
        "Reports",
    ],
    UserRole.MANAGER: [
        "Dashboard",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Reports",
    ],
    UserRole.BILLING_OPERATOR: [
        "Dashboard",
        "Ticketing",
        "Payments",
    ],
    UserRole.TICKET_CHECKER: [
        "Dashboard",
        "Ticket Verification",
    ],
}
