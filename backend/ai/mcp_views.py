"""
MCP (Model Context Protocol) JSON-RPC 2.0 Gateway Endpoint

Complies with Anthropic's Model Context Protocol Specification (2024-11-05).
Supports tools/list, tools/call, initialize, ping, and server capabilities.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from django.http import JsonResponse
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_json_api.parsers import JSONParser as JSONAPIParser
from rest_framework_json_api.renderers import JSONRenderer as JSONAPIRenderer

from drf_spectacular.utils import extend_schema, OpenApiResponse

from api.models import Tenant
from .mcp_tools import MCP_TOOLS_SPEC, MCPToolExecutor

logger = logging.getLogger(__name__)

MCP_PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {
    "name": "digital-ciso-security-platform",
    "version": "1.0.0",
}
SERVER_CAPABILITIES = {
    "tools": {
        "listChanged": False,
    },
    "resources": {
        "subscribe": False,
        "listChanged": False,
    },
    "prompts": {
        "listChanged": False,
    },
    "logging": {},
}


class MCPGatewayView(APIView):
    """
    Model Context Protocol (MCP) JSON-RPC Gateway.
    Allows external AI clients (Claude Desktop, Cursor, VS Code, Agents) to discover and execute security tools.
    """
    parser_classes = [JSONParser, JSONAPIParser]
    renderer_classes = [JSONRenderer, JSONAPIRenderer]

    @extend_schema(
        summary="Model Context Protocol (MCP) Discovery & Capabilities",
        description="Returns MCP server capabilities and protocol version.",
        responses={200: OpenApiResponse(description="MCP Server Info & Tool Manifest")},
    )
    def get(self, request: Request) -> Response:
        """HTTP GET returns server capabilities and available tools."""
        return Response({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "serverInfo": SERVER_INFO,
            "capabilities": SERVER_CAPABILITIES,
            "tools": MCP_TOOLS_SPEC,
        }, status=status.HTTP_200_OK)

    @extend_schema(
        summary="MCP JSON-RPC Gateway (tools/list, tools/call, initialize)",
        description="Executes MCP JSON-RPC 2.0 protocol methods (e.g. tools/list, tools/call).",
        responses={200: OpenApiResponse(description="JSON-RPC 2.0 Response")},
    )
    def post(self, request: Request) -> Response:
        """Handles MCP JSON-RPC 2.0 requests."""
        body = request.data
        if not isinstance(body, dict):
            return self._jsonrpc_error(None, -32700, "Parse error: Invalid JSON payload.")

        req_id = body.get("id")
        method = body.get("method")
        params = body.get("params", {})

        if not method:
            return self._jsonrpc_error(req_id, -32600, "Invalid Request: 'method' field is required.")

        user = request.user if request.user and request.user.is_authenticated else None
        tenant_id = getattr(request, "tenant_id", None)
        tenant = Tenant.objects.filter(id=tenant_id).first() if tenant_id else Tenant.objects.first()

        try:
            # 1. Initialize
            if method == "initialize":
                return self._jsonrpc_result(req_id, {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "serverInfo": SERVER_INFO,
                    "capabilities": SERVER_CAPABILITIES,
                    "instructions": "Digital CISO Security Platform MCP Gateway. Use tools to query findings, analyze threats with Qwen/Claude, and execute approved remediations.",
                })

            # 2. Ping
            elif method == "ping":
                return self._jsonrpc_result(req_id, {})

            # 3. Tools List
            elif method == "tools/list":
                return self._jsonrpc_result(req_id, {
                    "tools": MCP_TOOLS_SPEC,
                })

            # 4. Tools Call
            elif method == "tools/call":
                tool_name = params.get("name")
                arguments = params.get("arguments", {})

                if not tool_name:
                    return self._jsonrpc_error(req_id, -32602, "Invalid params: 'name' is required for tools/call.")

                logger.info("Executing MCP tool '%s' for user '%s'", tool_name, user.email if user else "anonymous")
                tool_output = MCPToolExecutor.execute_tool(
                    tool_name=tool_name,
                    arguments=arguments,
                    user=user,
                    tenant=tenant,
                )

                # Format in MCP standard Content Array
                is_error = "error" in tool_output
                return self._jsonrpc_result(req_id, {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(tool_output, indent=2),
                        }
                    ],
                    "isError": is_error,
                })

            # 5. Resources List (Optional)
            elif method == "resources/list":
                return self._jsonrpc_result(req_id, {"resources": []})

            # 6. Prompts List (Optional)
            elif method == "prompts/list":
                return self._jsonrpc_result(req_id, {"prompts": []})

            else:
                return self._jsonrpc_error(req_id, -32601, f"Method '{method}' not found.")

        except Exception as e:
            logger.exception("Error executing MCP method '%s': %s", method, str(e))
            return self._jsonrpc_error(req_id, -32000, f"Server error: {str(e)}")

    def _jsonrpc_result(self, req_id: Any, result: dict[str, Any]) -> Response:
        return Response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": result,
        }, status=status.HTTP_200_OK)

    def _jsonrpc_error(self, req_id: Any, code: int, message: str) -> Response:
        return Response({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": code,
                "message": message,
            },
        }, status=status.HTTP_200_OK)