from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseRemediationAdapter(ABC):
    """
    Abstract adapter for ticket-based remediation orchestration.
    Designed for future extensibility to ServiceNow, Azure DevOps, GitHub Issues, Linear, and Asana.
    """

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Test authentication and connectivity to the ticketing platform."""
        pass

    @abstractmethod
    def get_projects(self) -> List[Dict[str, Any]]:
        """Retrieve available projects / workspaces / repositories."""
        pass

    @abstractmethod
    def get_issue_types(self, project_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve available issue or ticket types."""
        pass

    @abstractmethod
    def get_assignable_users(self, project_key: str, query: str = "") -> List[Dict[str, Any]]:
        """Search and retrieve users who can be assigned to tickets."""
        pass

    @abstractmethod
    def get_priorities(self) -> List[Dict[str, Any]]:
        """Retrieve available priority levels."""
        pass

    @abstractmethod
    def create_remediation_ticket(
        self,
        project_key: str,
        summary: str,
        description_data: Dict[str, Any],
        issue_type: str = "Task",
        priority: str = "Medium",
        assignee_id: Optional[str] = None,
        labels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a new remediation ticket on the external platform."""
        pass

    @abstractmethod
    def get_ticket_status(self, ticket_key: str) -> Dict[str, Any]:
        """Fetch current status and metadata of a ticket."""
        pass
