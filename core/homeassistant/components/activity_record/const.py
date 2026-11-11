"""Constants for the permanent activity record."""

DOMAIN = "activity_record"

# Folder inside the configuration folder that holds the Git repository.
REPO_DIR = "activity_record"
# Folder outside the repository that holds the SSH key and known hosts.
SSH_DIR = ".activity_record_ssh"

CONF_COMMIT_INTERVAL = "commit_interval"
DEFAULT_COMMIT_INTERVAL = 600
MIN_COMMIT_INTERVAL = 60
MAX_COMMIT_INTERVAL = 3600

# Entries waiting to be written. More than this are dropped and counted.
MAX_QUEUE = 5000
# Entries written in one flush.
BATCH_SIZE = 1000
# Seconds a first queued entry waits so that one flush takes many entries.
FLUSH_DELAY = 3
# Seconds between tries after a failed write; the last value repeats.
RETRY_BACKOFF = (5, 10, 30, 60)
# Seconds between checks for event types registered after the start.
EARLY_RECHECK = 3

# A day file is rolled into a new chunk at about this many bytes.
CHUNK_BYTES = 1 << 20

# Longest text kept for one field of an entry.
MAX_TEXT = 2000
# Most simple attributes kept for one entry.
MAX_ATTRIBUTES = 8

# Reading and searching are bounded.
READ_LIMIT = 1000
DEFAULT_READ_LIMIT = 200
SEARCH_LIMIT = 1000
SEARCH_BYTES_DEFAULT = 16 * 1024 * 1024
SEARCH_BYTES_MAX = 64 * 1024 * 1024
DAYS_LIMIT = 4000

# Git time limits in seconds.
COMMIT_TIMEOUT = 180
PUSH_TIMEOUT = 300
# A lock file left by a killed Git is removed after this many seconds.
STALE_LOCK_SECONDS = 300
# Commits sent in one step of a push, so a long history never needs one giant push.
PUSH_STEP_COMMITS = 200

AUTHOR_NAME = "Home Assistant Activity Record"
AUTHOR_EMAIL = "activity-record@localhost"

ERROR_GIT = "git_error"
ERROR_INVALID_DAY = "invalid_day"
ERROR_INVALID_CURSOR = "invalid_cursor"
ERROR_BUSY = "busy"
ERROR_NOT_RUNNING = "not_running"
