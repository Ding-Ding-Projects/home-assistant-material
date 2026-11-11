# Backups and automation repositories

A backup must carry every automation repository with its full history, and a restore must bring them back. The automation repositories live in the `automation_repos/` folder of the configuration directory: a root repository (`.git`, `manifest.json`, `snapshots/`) and one repository per automation under `automations/<name>/.git`.

## What is tested

`core/tests/components/backup/test_automation_repos_backup.py` builds a throwaway configuration folder with that layout, makes real commits by running Git, and then:

- checks that no pattern in `EXCLUDE_FROM_BACKUP` (with or without the database patterns) matches any path under `automation_repos/`, using the same matching rule as the backup writer, and that the matcher does exclude something it should (a log file), so the check is not inert;
- runs the backup writer's real archive code path (`CoreBackupReaderWriter._mkdir_and_generate_backup_contents`) and compares the extracted tree with the source: every file and every `.git` folder is present and file contents are identical;
- extracts the archive and asks Git for the commit ids: `HEAD` and the list of all commits match the originals in every repository, `git fsck --full --strict` passes and the working tree is clean;
- adds a 96 MiB object file inside a `.git/objects/pack` folder and confirms it is archived at full size, so no size rule skips it.

No exclude pattern needed changing; `const.py` is unchanged.

## What is not proven

- The tests were written but not run on the machine where they were authored: the Python environment there has neither `securetar` nor the Home Assistant test plugin installed. They need the project's normal test environment.
- No real remote repository is involved; nothing is fetched or pushed.
- Encrypted backups were not exercised; the archive is created without a password.
- A full restore through the running system (the restore on restart) is not covered; only archive contents and extracted Git state are.
- Nothing here was seen in a browser; the interface is unchanged.
