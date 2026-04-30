import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env so all API keys are available to job functions
load_dotenv(Path(__file__).parent / ".env")

from redis import Redis
from rq import Worker, Queue

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/1")
redis_conn = Redis.from_url(redis_url)

listen = ['personaforge_queue', 'default']

def start_worker():
    print("Initializing RQ Background Worker...")
    worker = Worker(listen, connection=redis_conn, default_result_ttl=86400)
    try:
        worker.work()
    except KeyboardInterrupt:
        print("Shutting down worker safely.")
        sys.exit(0)

if __name__ == '__main__':
    start_worker()
