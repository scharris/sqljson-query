## Installation
Follow [installation instructions at oracle.github.io](https://oracle.github.io/node-oracledb/INSTALL.html#quickstart).

### Quick installation instructions for Windows

Download the x64 Instant Client "Lite" from:
```
https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html
```

Unzip, and copy or move the extracted folder to:

```
C:\Apps\dev\oracle_instantclient_19_8
```

Add this folder to the Path environment variable for your account.

The folder should contain `oci.dll` and various other files.

Next have an administrator install "Microsoft Visual C++ Redistributable for Visual Studio 2015-2019" from:
```
https://support.microsoft.com/en-us/help/2977003/the-latest-supported-visual-c-downloads
```
via the `x64: vc_redist.x64.exe` link.

# Create an env file with connection information
See `example/ora/db` for a template of expected content.
