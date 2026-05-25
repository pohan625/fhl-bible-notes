# PostHog setup report

PostHog is now wired into the static build. The build reads `POSTHOG_KEY` or `POSTHOG_PROJECT_API_KEY`, optionally `POSTHOG_HOST`, and injects the official browser snippet into `public/index.html` from `build/template.html`. If no key is present, the local build leaves PostHog out so local previews do not send analytics accidentally.

| Event name | Description | File |
| --- | --- | --- |
| `$pageview` | SPA pageview captured on initial load, History API navigation, and browser back/forward navigation. | `build/template.html` |
| `bible_book_selected` | User opens a Bible book from the home list or book-name search. | `build/template.html` |
| `commentary_chapter_opened` | User opens a commentary chapter from the chapter grid, search results, or next/previous chapter controls. | `build/template.html` |
| `book_intro_opened` | User opens author preface or background intro content for a book. | `build/template.html` |
| `full_text_search_performed` | User performs a full-text search; sends query length and result count only, not the query text. | `build/template.html` |
| `reading_font_size_changed` | User changes reading font size. | `build/template.html` |
| `about_opened` | User opens the about screen from the home header. | `build/template.html` |
| `bottom_tab_selected` | User switches top-level tabs when the tab bar is enabled. | `build/template.html` |
| `external_link_opened` | User opens the donation or GitHub links from the about screen. | `build/template.html` |

## Deployment

Set these environment variables in the production deploy target for `biblestudy.tw`:

```sh
POSTHOG_KEY=phc_your_project_api_key
POSTHOG_HOST=https://us.i.posthog.com
```

Use `https://eu.i.posthog.com` for `POSTHOG_HOST` instead if the PostHog project is in the EU region.

No dashboard was created from this environment because no PostHog MCP/dashboard tool is available in this Codex session.
