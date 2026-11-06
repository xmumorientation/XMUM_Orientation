/**
 * XMUM Orientation website: short tester feedback form (about 1 minute).
 *
 * How to use:
 *   1. Go to https://script.google.com and create a new project.
 *   2. Paste this whole file into Code.gs and save.
 *   3. Pick `createFeedbackForm` in the function dropdown and press Run.
 *      Approve the permissions (Forms, Drive, Sheets).
 *   4. Open the execution log for the edit link, the share link and the responses sheet.
 *   5. Optional: set NOTIFY_EMAIL below, then run `installBlockedBugAlert` once.
 *
 * Apps Script cannot create a "file upload" question, so screenshots are asked for as a
 * link. To allow real uploads, add a "File upload" question by hand in the form editor
 * (respondents will then have to sign in to Google).
 */

const FORM_TITLE = 'XMUM Orientation Website: Quick Feedback';
const NOTIFY_EMAIL = ''; // e.g. 'you@example.com'. Leave empty to turn alerts off.

// Used by the alert trigger to find answers by question title.
const Q_AREA = 'Which part of the website?';
const Q_WHAT = 'What happened?';
const Q_IMPACT = 'How bad was it?';
const IMPACT_BLOCKED = 'Blocked: I could not continue';

function createFeedbackForm() {
  const form = FormApp.create(FORM_TITLE);

  form
    .setDescription(
      'Found a bug or have an idea for the XMUM Orientation website? Tell us in about a minute.\n' +
      'Please do not include passwords or phone numbers.'
    )
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true)
    .setConfirmationMessage('Thank you! You can send another one if you found more.');

  // ---------------------------------------------------------------- Page 1
  form.addListItem()
    .setTitle('Your role')
    .setChoiceValues([
      'Freshie',
      'Facilitator (Faci)',
      'Game Master (GM)',
      'Committee / HOF / OC / HOGM',
      'Admin',
      'Other Tester'
    ])
    .setRequired(true);

  form.addListItem()
    .setTitle(Q_AREA)
    .setChoiceValues([
      'Login or Account',
      'Home',
      'Schedule',
      'Map',
      'Items or Inventory',
      'Scores',
      'Ops or Station (Staff Pages)',
      'Scan, Check-In or Attendance',
      'Tokens, Blind Box or Puzzle',
      'Funfair',
      'FAQ or Profile',
      'Admin Pages',
      'Everything or Other'
    ])
    .setRequired(true);

  // Branching: the choices are set below, once the target pages exist.
  const typeItem = form.addMultipleChoiceItem()
    .setTitle('What do you want to tell us?')
    .setRequired(true);

  // ---------------------------------------------------------------- Bug page
  const bugPage = form.addPageBreakItem().setTitle('Bug');

  form.addParagraphTextItem()
    .setTitle(Q_WHAT)
    .setHelpText('What did you do, and what went wrong? Example: Tapped Day 2 on Schedule and the page went blank.')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle(Q_IMPACT)
    .setChoiceValues([
      IMPACT_BLOCKED,
      'Broken, but I found a way around it',
      'Small glitch or looks off'
    ])
    .setRequired(true);

  form.addListItem()
    .setTitle('Device and browser')
    .setChoiceValues([
      'iPhone, Safari',
      'iPhone, Chrome',
      'Android, Chrome',
      'Android, Other Browser',
      'Laptop, Chrome',
      'Laptop, Safari / Firefox / Edge',
      'Tablet',
      'Not Sure'
    ])
    .setRequired(false);

  form.addTextItem()
    .setTitle('Screenshot link')
    .setHelpText('Optional. Paste a Google Drive or Imgur link that anyone can view.')
    .setRequired(false);

  // A bug report ends here and is submitted.
  bugPage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // ---------------------------------------------------------------- Suggestion page
  const suggestionPage = form.addPageBreakItem().setTitle('Suggestion');

  form.addParagraphTextItem()
    .setTitle('What should we change or add?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Why would it help?')
    .setHelpText('Optional.')
    .setRequired(false);

  // ---------------------------------------------------------------- Branching
  typeItem.setChoices([
    typeItem.createChoice('Report a Bug', bugPage),
    typeItem.createChoice('Suggest an Improvement or New Feature', suggestionPage)
  ]);

  // ---------------------------------------------------------------- Responses sheet
  const sheet = SpreadsheetApp.create(FORM_TITLE + ' (Responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());

  Logger.log('Edit the form:  ' + form.getEditUrl());
  Logger.log('Share this link: ' + form.getPublishedUrl());
  Logger.log('Responses sheet: ' + sheet.getUrl());
}

/**
 * Optional. Emails NOTIFY_EMAIL whenever someone reports a bug that blocked them.
 * Run once after createFeedbackForm. Running it again will not add a second trigger.
 */
function installBlockedBugAlert() {
  if (!NOTIFY_EMAIL) throw new Error('Set NOTIFY_EMAIL at the top of the file first.');
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) throw new Error('Run createFeedbackForm first.');

  const exists = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'onFeedbackSubmit');
  if (exists) return;

  ScriptApp.newTrigger('onFeedbackSubmit')
    .forForm(FormApp.openById(formId))
    .onFormSubmit()
    .create();
}

function onFeedbackSubmit(e) {
  const answers = {};
  e.response.getItemResponses().forEach(r => {
    answers[r.getItem().getTitle()] = r.getResponse();
  });

  if (answers[Q_IMPACT] !== IMPACT_BLOCKED) return;

  MailApp.sendEmail(
    NOTIFY_EMAIL,
    'Blocking bug reported: ' + (answers[Q_AREA] || 'Unknown area'),
    'A tester could not continue.\n\n' +
    'Area: ' + (answers[Q_AREA] || '-') + '\n' +
    'What happened: ' + (answers[Q_WHAT] || '-') + '\n\n' +
    'Open the responses sheet for the full report.'
  );
}
