# agents/ — agent-agnostic instructions and skills

Complement to `AGENTS.md` (repo root). Anything here must be usable by any
coding agent (OMP/oh-my-pi, pi, opencode, codex, claude, Cursor, and future
ones) — no agent-specific tooling, paths, or conventions.

## Layout

- `skills/<name>/SKILL.md` — one self-contained skill per directory.
  `SKILL.md` carries YAML frontmatter (`name`, `description`) so agents that
  support the skills convention can load it directly; the body is plain
  markdown so any agent can follow it by reading the file.

## Discovery (walk-up)

- This repo (`~/ljubomirj.github.io`) is a subdirectory of HOME (`~`). The
  HOME-level agent files apply everywhere and win over project-level ones:
  `~/AGENTS.md` and `~/agents/` (shared skills in `~/agents/skills/`, shared
  instructions in `~/agents/instructions/`). Read those first; this project's
  `AGENTS.md` and `agents/` only add repo-specific rules on top.
- No symlinks from HOME into project subdirectories — there would be an
  impossible number. Pointing up from each project is the mechanism.
- Skills directories are always visible: `agents/`, never hidden `.agents/`.
  This is deliberate — too important to hide.

## For agents

- When a task touches an area covered by a skill here, read that skill's
  `SKILL.md` first and follow it.
- When you learn a repeatable workflow for this repo, distill it into a new
  `skills/<name>/SKILL.md` instead of leaving it tribal knowledge.
- Keep edits here generic: plain markdown, relative paths, standard shell.
