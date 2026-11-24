// Text for the Campaigns page. Read-only for now: the page only describes what is coming.
// Each small card is { icon, title, text }.

export const CAMPAIGNS_INTRO = {
  title: 'Campaigns',
  badge: 'Coming soon',
  lead: 'Run challenges like 75 Hard for your members, so they keep coming back, stay on track and cheer each other on.',
  note: 'This page is a preview. You can’t create or join a campaign yet. We’ll let you know in the release notes when it is ready.',
};

// What a campaign is, in four short steps.
export const HOW_IT_WORKS = [
  { icon: '🎯', title: '1. Pick a challenge', text: 'Start from a ready-made template like 75 Hard, or build your own with your own daily tasks.' },
  { icon: '👥', title: '2. Invite members', text: 'Choose who can join: everyone, or only some members. A member can join with one tap.' },
  { icon: '✅', title: '3. Daily check-in', text: 'Each day the member ticks off the tasks they finished. You can see who did and who didn’t.' },
  { icon: '🏆', title: '4. Streaks and rewards', text: 'Streaks, points and a leaderboard keep it fun. Give a prize or a free month to the finishers.' },
];

// The 75 Hard challenge, explained one rule at a time.
export const HARD_75 = {
  title: '75 Hard Challenge',
  summary: '75 days in a row, 5 tasks every day. If a member misses even one task, they start again from Day 1.',
  tasks: [
    { icon: '🏋️', title: 'Two workouts', text: 'Two 45-minute workouts every day. One of them must be outdoors.' },
    { icon: '🥗', title: 'Follow a diet', text: 'Stick to a diet you choose. No cheat meals and no alcohol.' },
    { icon: '💧', title: 'Drink 4 litres of water', text: 'About one gallon of water through the day.' },
    { icon: '📖', title: 'Read 10 pages', text: '10 pages of a non-fiction or self-improvement book.' },
    { icon: '📸', title: 'Progress photo', text: 'One photo every day, so the change can be seen.' },
  ],
};

// Other campaign ideas, each in its own card.
export const IDEAS = [
  { icon: '🔥', title: '30-Day Streak', text: 'Come to the gym a set number of days in a month. Great for building the habit.' },
  { icon: '⚖️', title: 'Weight-Loss Race', text: 'Members or teams compete on weight lost, using the weight they already update in the app.' },
  { icon: '🤝', title: 'Refer a Friend', text: 'Reward members who bring a friend who joins. Grows your gym by word of mouth.' },
  { icon: '💪', title: 'Strength Goals', text: 'Set a target, like a first pull-up or a heavier squat, and mark it when it is done.' },
  { icon: '🌅', title: 'Early Bird', text: 'Reward members who come in during quiet hours to spread out the crowd.' },
  { icon: '🛠️', title: 'Your Own Campaign', text: 'Choose the length, the daily tasks, the rules and the prize yourself.' },
];

// What the gym owner gets from it.
export const BENEFITS = [
  { icon: '📈', title: 'More engagement', text: 'Members who have a goal come more often and stay longer.' },
  { icon: '🔁', title: 'Fewer drop-outs', text: 'A streak is hard to break. Members renew to finish what they started.' },
  { icon: '👀', title: 'See who is active', text: 'Spot members who stopped checking in, and send them a nudge on WhatsApp.' },
  { icon: '📣', title: 'Free marketing', text: 'Members share their progress and the gym gets noticed.' },
];
