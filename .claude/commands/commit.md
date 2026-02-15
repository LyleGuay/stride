---
name: commit
description: Create a commit with a conventional format message based on staged changes
allowed-tools: Bash
---

Create a git commit for the currently staged changes.

## Process

1. Run `git diff --cached` to see what's staged. If nothing is staged, tell the user and stop.
2. Run `git log --oneline -5` to see recent commit style for reference.
3. Analyze the staged changes and write a commit message in this format:

```
<type>: <brief title>

<short description of changes, can include bullet points>
```

**Types:** `feature`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`

4. Show the user the proposed commit message and ask for approval before committing.
5. If approved, create the commit. Use a HEREDOC to pass the message:

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

## Rules

- Only commit what is already staged. Do not stage files.
- Keep the title under 70 characters.
- Keep the description concise — a sentence or a few bullet points, not a novel.
- Do not add `Co-Authored-By` or any trailers.
