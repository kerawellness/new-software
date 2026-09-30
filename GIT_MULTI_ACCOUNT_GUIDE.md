# Multiple GitHub Accounts Setup Guide

A complete reference guide for managing multiple GitHub accounts (Personal, Work, Organization, Client) on a single Windows machine.

---

## 1. How It Works (The 2 Git Layers)

Whenever you interact with GitHub, Git separates two things:

1. **Authentication (SSH Key)**: Determines *who is connecting to GitHub* and whether they have read/write permissions to push/pull.
2. **Attribution (Author Name & Email)**: Determines *whose profile picture and name appear on the commit list* on GitHub.

To make multiple accounts work cleanly without conflicts, each account gets its own **SSH key** and a matching **Host Alias** in `~/.ssh/config`.

---

## 2. Your Current Machine Setup

Your PC currently has the following configuration:

| Account / Purpose | SSH Key | SSH Host Alias | GitHub Account |
| :--- | :--- | :--- | :--- |
| **Personal** | `~/.ssh/id_ed25519` | `github.com` (Default) | `aswinvadivel` (`vaswin1220@gmail.com`) |
| **Kerawellness** | `~/.ssh/id_kerawellness` | `github-kerawellness` | `kerawellness` |

Your SSH configuration file is located at:
`C:\Users\ljashwin\.ssh\config`

---

## 3. Step-by-Step: Adding a New GitHub Account

Follow these steps whenever you need to add another GitHub account (e.g. `client-account` or `company-account`).

### Step 1: Generate a dedicated SSH key
Open PowerShell and run (replace `my-new-account` with a recognizable name):

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_my-new-account
```
*(Press Enter when prompted for passphrase).*

### Step 2: Add the public key to GitHub
Copy the public key to your Windows clipboard:

```powershell
Get-Content ~/.ssh/id_my-new-account.pub | Set-Clipboard
```

1. Log into the target GitHub account in your web browser.
2. Navigate to **Settings** &rarr; **SSH and GPG keys** &rarr; **New SSH key**.
3. Paste the key and save it.

### Step 3: Add an entry to `~/.ssh/config`
Open your SSH config file in Notepad:

```powershell
notepad ~/.ssh/config
```

Add a new `Host` block at the bottom:

```ssh
Host github-my-new-account
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_my-new-account
    IdentitiesOnly yes
```

### Step 4: Test the connection
Verify that GitHub recognizes the new key:

```powershell
ssh -T git@github-my-new-account
```
You should see:
> `Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.`

---

## 4. Working Inside a Repository

Whenever you work inside a project belonging to a specific account, configure both the **remote URL** and the **author details**.

### A. Point Remote URL to the correct Host Alias

Instead of the standard `git@github.com:...`, swap `github.com` with your alias:

* **When cloning a new repository:**
  ```powershell
  git clone git@github-my-new-account:username/repository-name.git
  ```

* **Inside an existing repository:**
  ```powershell
  git remote set-url origin git@github-my-new-account:username/repository-name.git
  ```

### B. Set the commit author for that project

Inside the project folder, set the local name and email (**do not** use `--global`):

```powershell
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

*(Note: To show the GitHub profile icon on commits, this email must be verified on that GitHub account or be the account's GitHub noreply email).*

---

## 5. Quick Verification Checklist

Before pushing commits in any project, run this 5-second check:

```powershell
# 1. Verify which remote and SSH alias will be used:
git remote -v

# 2. Verify which author name & email will be stamped on commits:
git config user.name
git config user.email

# 3. Push normally:
git push
```

---

## 6. Helpful Troubleshooting Commands

* **Accidentally committed with the wrong email on the latest commit?**
  ```powershell
  git config user.name "Correct Name"
  git config user.email "correct-email@example.com"
  git commit --amend --reset-author --no-edit
  ```

* **Check where your git config settings are coming from:**
  ```powershell
  git config --list --show-origin
  ```

* **Test any specific SSH key against GitHub directly:**
  ```powershell
  ssh -T -i ~/.ssh/id_my-new-account git@github.com
  ```
