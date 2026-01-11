from typing import Any

from .base import PlatformConnector
from .snowflake import SnowflakeConnector


def get_connector(
    platform: str,
    connection_config: dict[str, Any],
    credentials: dict[str, Any],
) -> PlatformConnector:
    """Factory function to get the appropriate connector."""

    if platform == "snowflake":
        return SnowflakeConnector(
            account=connection_config["account_identifier"],
            user=credentials["user"],
            private_key=credentials["private_key"],
            warehouse=connection_config.get("warehouse"),
        )

    elif platform == "databricks":
        raise NotImplementedError("Databricks connector coming soon")

    elif platform == "bigquery":
        raise NotImplementedError("BigQuery connector coming soon")

    elif platform == "redshift":
        raise NotImplementedError("Redshift connector coming soon")

    else:
        raise ValueError(f"Unknown platform: {platform}")
