from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    BILLING_OPERATOR = "BILLING_OPERATOR"
    TICKET_CHECKER = "TICKET_CHECKER"


# Menu items visible per role (used by frontend navigation)
ROLE_MENU_ITEMS: dict[UserRole, list[str]] = {
    UserRole.SUPER_ADMIN: [
        "Dashboard",
        "D Drive",
        "Parameter Master",
        "Users",
        "Ferries",
        "Branches",
        "Routes",
        "Schedules",
        "Items",
        "Item Rates",
        "Payment Modes",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
        "Rate Change Logs",
        "Employee Transfer",
        "Ticket Verification",
        "System Settings",
        "User Sessions",
    ],
    UserRole.ADMIN: [
        "Dashboard",
        "D Drive",
        "Parameter Master",
        "Users",
        "Ferries",
        "Branches",
        "Routes",
        "Schedules",
        "Items",
        "Item Rates",
        "Payment Modes",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
        "Rate Change Logs",
        "Employee Transfer",
        "Ticket Verification",
        "System Settings",
    ],
    UserRole.MANAGER: [
        "Dashboard",
        "Users",
        "Ferries",
        "Branches",
        "Routes",
        "Schedules",
        "Items",
        "Item Rates",
        "Payment Modes",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
        "Rate Change Logs",
        "Employee Transfer",
        "Ticket Verification",
    ],
    UserRole.BILLING_OPERATOR: [
        "Dashboard",
        "Ticketing",
        "Multi-Ticketing",
        "Reports",
    ],
    UserRole.TICKET_CHECKER: [
        "Dashboard",
        "Ticket Verification",
    ],
}
