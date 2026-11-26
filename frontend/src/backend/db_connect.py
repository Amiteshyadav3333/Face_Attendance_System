import mysql.connector
import os
from dotenv import load_dotenv

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The backend must use this project's DB credentials, even when the shell has
# inherited unrelated DB_USER/DB_PASSWORD values.
load_dotenv(os.path.join(_BASE_DIR, ".env"), override=True)

def get_db_connection():
    tls_options = {}
    ca_path = os.getenv("DB_SSL_CA")
    if ca_path:
        tls_options = {
            "ssl_ca": ca_path,
            "ssl_verify_cert": True,
            "ssl_verify_identity": True,
        }
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "attendance_system"),
        **tls_options,
    )
