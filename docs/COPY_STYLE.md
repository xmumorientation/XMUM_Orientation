# Copy style: Title Case

Every heading and button in the app is written in **Title Case**: each major word starts with a capital letter.

| Wrong | Right |
|---|---|
| Share location | Share Location |
| Keep tracking | Keep Tracking |
| Your location sharing | Your Location Sharing |
| Download QR | Download QR |
| Try again | Try Again |
| Group name and slogan | Group Name and Slogan |
| Back to home | Back to Home |

## Where it applies

Use Title Case for short labels that name something or start an action:

- Page titles, section headings, card titles, sheet and dialog titles (`h1` to `h4`, `Dialog.Title`, the bold title of a card or row).
- Buttons and links styled as buttons, including text that changes with state (`"Saving…"`, `"Share Location"` / `"Stop Sharing"`).
- Tabs, filter chips, segmented controls, menu items, nav items and the tab bar.
- Status pills and badges that are names (`In Progress`, `Game Over`). Mono uppercase pills look the same either way; still write them in Title Case in the code.
- Form field labels (`Planned Start`, `Campus Email`).
- The browser tab title (`<title>`, `metadata.title`).

## Where it does not apply

Keep sentence case (only the first word capitalised) for anything that reads as a sentence:

- Descriptions, helper text, notes and empty states (`Nothing here yet.`).
- Error, success and toast messages (`Could not load the password.`).
- Placeholders (`e.g. Taking photos`).
- `aria-label` and other text only screen readers hear.

Do not change:

- Text that code compares or parses, for example `roleLabel === "Freshie"`, the token reasons that `useItemsData.ts` matches with a regular expression (`Blind box`, `Day 2 entry`), status keys, or database values.
- Names that come from the database (group names, station names, FAQ text): Admin writes those.
- Sample and test data that stands in for database rows (`items/sampleData.ts`).

## How to capitalise

1. Capitalise the first and the last word, whatever they are.
2. Capitalise every other word, except these short words in the middle: a, an, the, and, but, or, nor, for, of, to, in, on, at, by, as, per, via, vs.
   `Back to Home`, `Group Name and Slogan`, `One Projector per Group`.
3. After a hyphen, capitalise the next part too: `Check-In`, `Sign-Up`. A minor word after a hyphen stays lowercase only in fixed phrases (`Day-to-Day`).
4. Keep acronyms and brand names as they are: QR, GPS, NFC, FAQ, HOF, HOGM, GM, Vortexa, XMUM.
5. Keep numbers and codes as they are: `Day 2`, `A1-2`, `Group 9`.

## Checklist for new code

Before you finish a change that adds or edits visible text:

- Is it a heading, button, tab, chip, menu item, field label or page title? Then it is in Title Case.
- Does the text change with state (`isSaving ? "Saving…" : "Save Changes"`)? Check every branch.
- Is it a sentence or a message? Then leave it in sentence case.
