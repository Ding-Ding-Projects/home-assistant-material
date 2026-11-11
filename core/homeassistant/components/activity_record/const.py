"""Constants for the permanent activity record."""

DOMAIN = "activity_record"

# Folder inside the configuration folder that holds the Git repository.
REPO_DIR = "activity_record"

CONF_COMMIT_INTERVAL = "commit_interval"
DEFAULT_COMMIT_INTERVAL = 60
MIN_COMMIT_INTERVAL = 10
MAX_COMMIT_INTERVAL = 3600

# Entries waiting to be written. More than this are dropped and counted.
MAX_QUEUE = 5000
# Entries written to the day file in one batch.
BATCH_SIZE = 1000

# Longest text kept for one field of an entry.
MAX_TEXT = 2000

# Reading and searching are bounded.
READ_LIMIT = 1000
DEFAULT_READ_LIMIT = 200
SEARCH_LIMIT = 1000
SEARCH_BYTES_DEFAULT = 64 * 1024 * 1024
SEARCH_BYTES_MAX = 256 * 1024 * 1024
DAYS_LIMIT = 4000

PUSH_TIMEOUT = 300

AUTHOR_NAME = "Home Assistant Activity Record"
AUTHOR_EMAIL = "activity-record@localhost"

ERROR_GIT = "git_error"
ERROR_INVALID_DAY = "invalid_day"
ERROR_NOT_RUNNING = "not_running"
