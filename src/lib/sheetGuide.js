// The "How to connect your Google Sheet" tutorial. Plain words on purpose. Edit freely.
// Each step: a title, a few short lines, and optional links to open (they open in a new tab).

export const GUIDE_INTRO =
  'To keep your members in your own Google Sheet, the app needs three things: a Google Sheet, a "service account" (think of it as a robot helper with its own email address), and permission for that robot to open your sheet. It takes about 10 minutes, and you only do it once.';

export const GUIDE_STEPS = [
  {
    title: 'Create your Google Sheet',
    body: [
      'Open Google Sheets and start a new blank sheet.',
      'Give it a name you will remember, for example “My Gym Members”.',
      'You do not need to type anything in it. The app adds the columns by itself.',
    ],
    links: [{ label: 'Open Google Sheets', href: 'https://sheets.google.com' }],
  },
  {
    title: 'Open Google Cloud and make a project',
    body: [
      'Open Google Cloud Console and sign in with the same Google account.',
      'At the top, click the project box, then “New project”.',
      'Type any name, for example “Gym App”, and click Create. Wait a few seconds, then make sure that project is selected at the top.',
    ],
    links: [{ label: 'Open Google Cloud Console', href: 'https://console.cloud.google.com' }],
  },
  {
    title: 'Turn on the Google Sheets API',
    body: [
      'In the menu on the left, go to “APIs & Services”, then “Library”.',
      'Search for “Google Sheets API”, open it and click Enable.',
    ],
  },
  {
    title: 'Create the service account (the robot helper)',
    body: [
      'Go to “IAM & Admin”, then “Service Accounts”, then click “Create service account”.',
      'Type a name, for example “gym-app”, and click “Create and continue”.',
      'You can skip the other boxes. Click “Continue”, then “Done”.',
    ],
  },
  {
    title: 'Download its key',
    body: [
      'Click the service account you just made, open the “Keys” tab, and choose “Add key”, then “Create new key”.',
      'Pick “JSON” and click Create. A small file downloads to your computer.',
      'Keep this file private. Anyone who has it can open your sheet. Do not send it to anyone or put it online.',
    ],
    note: 'If Google says creating keys is blocked, you are probably using a work or school Google account. Use a personal Google account (like Gmail) instead.',
  },
  {
    title: 'Find the two things you need in that file',
    body: [
      'Open the downloaded file with Notepad (right-click, “Open with”, Notepad).',
      'Find the line that starts with “client_email”. The long address in quotes, ending in .gserviceaccount.com, is your service account email. Copy it.',
      'Find the line that starts with “private_key”. Copy everything inside the quotes, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----. It is long, and that is normal.',
    ],
  },
  {
    title: 'Share your sheet with the service account',
    body: [
      'Go back to your Google Sheet and click the green “Share” button.',
      'Paste the service account email, and set its role to “Editor”.',
      'Untick “Notify people” if you see it, then click Share (or Send).',
      'This is how you give the app permission. Google controls it, and you can take it away at any time by removing that email from Share.',
    ],
  },
  {
    title: 'Copy your sheet’s link',
    body: [
      'With your sheet open, click the address bar at the top of your browser and copy the whole link. It starts with https://docs.google.com/spreadsheets/…',
    ],
  },
  {
    title: 'Connect it in the app',
    body: [
      'Click the person icon at the top right, then “Settings”. Under Google Sheets, click “Connect” and fill in the three boxes: the service account email, the private key, and the sheet link.',
      'Click Connect. If everything is right, you will see that your sheet is connected, and your members list opens.',
    ],
  },
];

export const GUIDE_PROBLEMS = [
  {
    problem: '“Google refused access” or “permission denied”',
    fix: 'The sheet is not shared with the service account yet. Do the sharing step again, and check the role is “Editor”.',
  },
  {
    problem: '“That private key isn’t valid”',
    fix: 'Copy the whole private key again, including the BEGIN and END lines. Do not leave out any part.',
  },
  {
    problem: '“That doesn’t look like a service account email”',
    fix: 'Use the client_email from the file. It ends with .gserviceaccount.com, and it is not your own Gmail address.',
  },
  {
    problem: '“Google Sheet not found”',
    fix: 'Check the sheet link. Copy it again from your browser while the sheet is open.',
  },
];
