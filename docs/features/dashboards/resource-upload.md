# Upload a dashboard resource

Open **Settings → Dashboards → Resources**, choose **Add resource**, then choose **Upload file**.
Pick a standalone JavaScript module (`.js` or `.mjs`) or stylesheet (`.css`) up to 5 MiB. Choose
**Create**, then review and confirm the extension permission prompt. The **URL** option still works
for hosted files and existing resource configurations.

The server only accepts uploads from administrators while dashboard resources are managed in
storage mode. Uploaded files are served through authenticated resource URLs. JavaScript runs in
the dashboard session, so choose a file from a source you trust.

To replace an upload, delete the resource entry, then upload the replacement. If the browser
already loaded the old file, refresh it after deletion. Modules that import neighboring files and
stylesheets that reference neighboring assets need those files to be hosted separately.
