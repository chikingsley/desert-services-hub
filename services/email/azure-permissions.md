# Azure App Permissions Reference

* *APP NAME:** Desert Services
* *CONTEXT:** n8n Integration / Azure Entra ID Permissions
* *LAST UPDATED:** December 2025

- --

## Microsoft Graph API

### Delegated Permissions (User Context)

These require a user to sign in interactively.

| Permission | Status |
|------------|--------|
| Calendars.Read | GRANTED |
| Calendars.Read.Shared | GRANTED |
| Calendars.ReadBasic | GRANTED |
| Calendars.ReadWrite | GRANTED |
| Calendars.ReadWrite.Shared | GRANTED |
| email | GRANTED |
| Files.Read | GRANTED |
| Files.Read.All | GRANTED |
| Files.Read.Selected | GRANTED |
| Files.ReadWrite | GRANTED |
| Files.ReadWrite.All | GRANTED |
| Files.ReadWrite.AppFolder | GRANTED |
| Files.ReadWrite.Selected | GRANTED |
| Mail.Read | GRANTED |
| Mail.Read.Shared | GRANTED |
| Mail.ReadBasic | GRANTED |
| Mail.ReadBasic.Shared | GRANTED |
| Mail.ReadWrite | GRANTED |
| Mail.ReadWrite.Shared | GRANTED |
| Mail.Send | GRANTED |
| Mail.Send.Shared | GRANTED |
| MailboxFolder.Read | GRANTED |
| MailboxFolder.ReadWrite | GRANTED |
| MailboxItem.Read | GRANTED |
| MailboxSettings.Read | GRANTED |
| MailboxSettings.ReadWrite | GRANTED |
| offline_access | GRANTED |
| openid | GRANTED |
| profile | GRANTED |
| SearchConfiguration.Read.All | GRANTED |
| SearchConfiguration.ReadWrite.All | GRANTED |
| Sites.Manage.All | GRANTED |
| Sites.Read.All | GRANTED |
| Sites.ReadWrite.All | GRANTED |
| Sites.Selected | GRANTED |
| Tasks.Read | GRANTED |
| Tasks.Read.Shared | GRANTED |
| Tasks.ReadWrite | GRANTED |
| Tasks.ReadWrite.Shared | GRANTED |
| User.Read | GRANTED |

### Application Permissions (Service Context)

These work without user sign-in (daemon/service apps).

| Permission | Status |
|------------|--------|
| Group.Read.All | GRANTED |
| Mail.Read | GRANTED |
| Mail.ReadBasic | GRANTED |
| Mail.ReadBasic.All | GRANTED |
| Mail.ReadWrite | GRANTED |
| Mail.Send | **NOT GRANTED** |
| SearchConfiguration.Read.All | GRANTED |
| SearchConfiguration.ReadWrite.All | GRANTED |
| Sites.Read.All | GRANTED |
| Sites.ReadWrite.All | GRANTED |
| User-Mail.ReadWrite.All | GRANTED |

- --

## SharePoint API (Legacy)

### Delegated Permissions

| Permission | Status |
|------------|--------|
| AllSites.Manage | GRANTED |
| AllSites.Read | GRANTED |
| AllSites.Write | GRANTED |
| MyFiles.Read | GRANTED |
| MyFiles.Write | GRANTED |
| Project.Read | GRANTED |
| Project.Write | GRANTED |
| Sites.Read.All | GRANTED |
| Sites.ReadWrite.All | GRANTED |
| Sites.Selected | GRANTED |
| TaskStatus.Submit | GRANTED |

### Application Permissions

| Permission | Status |
|------------|--------|
| Sites.Read.All | GRANTED |
| Sites.ReadWrite.All | GRANTED |

- --

## Verified Working (Dec 2025)

### App-Only Auth (Client Credentials)

- ✅ Read emails from any mailbox
- ✅ Update email categories (tag/categorize)
- ✅ Search emails
- ✅ Download attachments
- ❌ Send emails (Mail.Send app permission not granted)

### Requires Delegated Auth (User Sign-In)

- Microsoft To Do tasks (no app permission exists for Tasks)
- Send emails (unless you grant Mail.Send app permission)
