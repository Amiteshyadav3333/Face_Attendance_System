import mysql.connector
import os
from dotenv import load_dotenv

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The backend must use this project's DB credentials, even when the shell has
# inherited unrelated DB_USER/DB_PASSWORD values.
load_dotenv(os.path.join(_BASE_DIR, ".env"), override=True)

def get_db_connection():
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "attendance_system")
    )
    return conn
