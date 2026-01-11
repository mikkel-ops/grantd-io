from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def generate_key_pair(key_size: int = 2048) -> tuple[str, str]:
    """Generate an RSA key pair for Snowflake authentication.

    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
    )

    # Serialize private key to PEM
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    # Serialize public key to PEM
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    return private_pem, public_pem


def load_private_key(pem_path: str) -> bytes:
    """Load a private key from a PEM file for use with Snowflake.

    Returns:
        DER-encoded private key bytes
    """
    from pathlib import Path

    pem_content = Path(pem_path).read_bytes()
    private_key = serialization.load_pem_private_key(
        pem_content,
        password=None,
    )

    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
