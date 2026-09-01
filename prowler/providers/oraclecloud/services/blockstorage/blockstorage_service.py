"""OCI Block Storage Service Module."""

from typing import Optional

import oci
from pydantic import BaseModel

from prowler.lib.logger import logger
from prowler.providers.oraclecloud.lib.service.service import OCIService


class BlockStorage(OCIService):
    """OCI Block Storage Service class to retrieve block volumes and boot volumes."""

    def __init__(self, provider):
        """
        Initialize the Block Storage service.

        Args:
            provider: The OCI provider instance
        """
        super().__init__("blockstorage", provider)
        self.volumes = []
        self.boot_volumes = []
        self.__threading_call__(self.__list_volumes__)
        self.__threading_call__(self.__list_boot_volumes__)

    def __get_client__(self, region):
        """
        Get the Block Storage client for a region.

        Args:
            region: Region key

        Returns:
            Block Storage client instance
        """
        return self._create_oci_client(
            oci.core.BlockstorageClient, config_overrides={"region": region}
        )

    def __list_volumes__(self, regional_client):
        """
        List all block volumes in the compartments.

        Args:
            regional_client: Regional OCI client
        """
        try:
            blockstorage_client = self.__get_client__(regional_client.region)
            if not blockstorage_client:
                return

            logger.info(
                f"BlockStorage - Listing Volumes in {regional_client.region}..."
            )

            for compartment in self.audited_compartments:
                try:
                    volumes = oci.pagination.list_call_get_all_results(
                        blockstorage_client.list_volumes, compartment_id=compartment.id
                    ).data

                    for volume in volumes:
                        if volume.lifecycle_state not in ["TERMINATED", "TERMINATING"]:
                            self.volumes.append(
                                Volume(
                                    id=volume.id,
                                    name=(
                                        volume.display_name
                                        if hasattr(volume, "display_name")
                                        else volume.id
                                    ),
                                    compartment_id=compartment.id,
                                    region=regional_client.region,
                                    lifecycle_state=volume.lifecycle_state,
                                    kms_key_id=(
                                        volume.kms_key_id
                                        if hasattr(volume, "kms_key_id")
                                        else None
                                    ),
                                )
                            )
                except Exception as error:
                    if hasattr(error, "status") and error.status == 404:
                        logger.debug(f"BlockStorage - No volumes in compartment {compartment.name or compartment.id}")
                    else:
                        logger.error(
                            f"{regional_client.region} -- {error.__class__.__name__}[{error.__traceback__.tb_lineno}]: {error}"
                        )
                    continue
        except Exception as error:
            if hasattr(error, "status") and error.status == 404:
                logger.debug(f"BlockStorage - 404 in {regional_client.region}")
            else:
                logger.error(
                    f"{regional_client.region} -- {error.__class__.__name__}[{error.__traceback__.tb_lineno}]: {error}"
                )

    def __list_boot_volumes__(self, regional_client):
        """
        List all boot volumes in the compartments.

        Args:
            regional_client: Regional OCI client
        """
        try:
            blockstorage_client = self.__get_client__(regional_client.region)
            if not blockstorage_client:
                return

            logger.info(
                f"BlockStorage - Listing Boot Volumes in {regional_client.region}..."
            )

            # Get availability domains for this region once using tenancy ID
            tenancy_id = getattr(self.provider.identity, "tenancy_id", None) or self.session_config.get("tenancy")
            identity_client = self._create_oci_client(
                oci.identity.IdentityClient,
                config_overrides={"region": regional_client.region},
            )
            try:
                availability_domains = identity_client.list_availability_domains(
                    compartment_id=tenancy_id
                ).data
            except Exception as ad_err:
                logger.warning(f"Could not list ADs in {regional_client.region}: {ad_err}")
                availability_domains = []

            for compartment in self.audited_compartments:
                try:
                    for ad in availability_domains:
                        boot_volumes = oci.pagination.list_call_get_all_results(
                            blockstorage_client.list_boot_volumes,
                            availability_domain=ad.name,
                            compartment_id=compartment.id,
                        ).data

                        for boot_volume in boot_volumes:
                            if boot_volume.lifecycle_state not in [
                                "TERMINATED",
                                "TERMINATING",
                            ]:
                                self.boot_volumes.append(
                                    BootVolume(
                                        id=boot_volume.id,
                                        name=(
                                            boot_volume.display_name
                                            if hasattr(boot_volume, "display_name")
                                            else boot_volume.id
                                        ),
                                        compartment_id=compartment.id,
                                        region=regional_client.region,
                                        lifecycle_state=boot_volume.lifecycle_state,
                                        kms_key_id=(
                                            boot_volume.kms_key_id
                                            if hasattr(boot_volume, "kms_key_id")
                                            else None
                                        ),
                                    )
                                )
                except Exception as error:
                    logger.error(
                        f"{regional_client.region} -- {error.__class__.__name__}[{error.__traceback__.tb_lineno}]: {error}"
                    )
                    continue
        except Exception as error:
            logger.error(
                f"{regional_client.region} -- {error.__class__.__name__}[{error.__traceback__.tb_lineno}]: {error}"
            )


# Service Models
class Volume(BaseModel):
    """OCI Block Volume model."""

    id: str
    name: str
    compartment_id: str
    region: str
    lifecycle_state: str
    kms_key_id: Optional[str] = None


class BootVolume(BaseModel):
    """OCI Boot Volume model."""

    id: str
    name: str
    compartment_id: str
    region: str
    lifecycle_state: str
    kms_key_id: Optional[str] = None
