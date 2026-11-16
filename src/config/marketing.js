export const pillars = [
  { id: 'operations', number: '01', icon: '▦', title: 'Gym operations', outcome: 'Know every member. Simplify every day.', description: 'Keep member profiles, memberships and check-ins together, so the front desk runs smoothly and you spend less time updating records.', features: ['Member profiles and membership records', 'Check-ins and attendance history', 'A dedicated workspace for each gym', 'Staff roles and permissions'], future: 'Guided spreadsheet imports' },
  { id: 'finances', number: '02', icon: '↗', title: 'Financial management', outcome: 'Know what came in. See what is still owed.', description: 'Bring invoices, payment records and outstanding balances into view. Spend less time matching spreadsheets to bank statements.', features: ['Membership plans and recurring invoices', 'Cash, EFT and online payment records', 'Outstanding balances and billing reports'], future: 'Expense tracking and profitability reporting' },
  { id: 'engagement', number: '03', icon: '◎', title: 'Member engagement', outcome: 'Give members a reason to stay connected.', description: 'Give your community a place to manage their details, see their activity and keep up with their membership.', features: ['A dedicated member portal', 'Membership and payment history', 'Attendance and personal profile information'], future: 'Automated follow-up campaigns and inactivity alerts' },
  { id: 'classes', number: '04', icon: '◷', title: 'Classes & bookings', outcome: 'Turn a full timetable into opportunity.', description: 'Make it easier to organise sessions, manage capacity and let members book their next class without another back-and-forth.', features: ['Class schedules and session management', 'Member bookings and capacity limits', 'Free and paid class sessions'], future: 'Class profitability and deeper utilisation insights' },
  { id: 'insights', number: '05', icon: '◫', title: 'Business intelligence', outcome: 'Understand your gym. Choose your next move.', description: 'Use attendance, membership and billing views to understand what is happening in your business and where to look next.', features: ['Member and attendance reporting', 'Billing summaries and payment visibility', 'Inactive-member lists and visit trends'], future: 'Deeper churn indicators and a combined gym health dashboard' }
];

export const faqs = [
  { question: 'Who is Fitnexis for?', answer: 'Fitnexis is being built for independent gym owners and small fitness businesses who want organised operations, clearer finances and a better member experience without the complexity of enterprise software.' },
  { question: 'Is there a free plan?', answer: 'Yes. Our direction is to keep core member administration and attendance accessible for free. Advanced financial and commercial capabilities will be offered through paid plans. Published plans and prices appear on our pricing page. Gym owners select their subscription in their gym settings.' },
  { question: 'Can I sign up my gym right now?', answer: 'You can register your gym through our registration page or request a walkthrough. Registrations are reviewed before activation. The authorized owner then verifies their email and configures payments. Registration alone does not charge a subscription.' },
  { question: 'Can I record cash and EFT payments?', answer: 'The current billing tools support cash and EFT payment records, invoices and outstanding balances. Online payment collection uses Paystack and requires configuration for your gym. Provider fees and requirements are separate from Fitnexis plan pricing.' },
  { question: 'Will it work on my phone?', answer: 'Fitnexis uses browser-based pages with responsive layouts. You can access your workspace or member portal through a supported mobile browser without installing a native app.' },
  { question: 'Can members book and pay for classes?', answer: 'The current class tools support schedules, bookings, capacity limits and paid sessions. Online payments depend on the gym payment setup. Ask for a walkthrough to see how this fits your classes.' },
  { question: 'Can I bring my existing member records?', answer: 'Tell us how you currently store your member records when you enquire. We can discuss an onboarding approach with you. A self-service spreadsheet import tool is planned and is not currently available.' },
  { question: 'Does Fitnexis send automated renewal or inactivity messages?', answer: 'Billing tools can show in-app renewal and invoice notices when billing jobs are configured. Automated email follow-up campaigns and inactivity outreach are planned. Current attendance and billing views also support manual follow-up.' },
  { question: 'How do existing gym members sign in?', answer: 'Use the login page on your gym’s own Fitnexis website. If you know your gym slug, use Find your gym to locate it. Fitnexis platform administration has a separate sign-in.' }
];

export const pages = {
  "home": {
    "title": "Gym Management Software for Independent Gyms | Fitnexis",
    "description": "Manage gym members, attendance, membership billing and class bookings with Fitnexis. Browser-based software for independent gyms in South Africa.",
    "path": "/",
    "label": "Home"
  },
  "features": {
    "title": "Gym Membership, Billing & Class Booking Software | Fitnexis",
    "description": "Explore Fitnexis tools for gym member records, check-ins, membership invoices, cash and EFT records, class bookings and member portals.",
    "path": "/features",
    "label": "Features"
  },
  "about": {
    "title": "About Fitnexis | Software for Independent Gym Owners",
    "description": "Learn how Fitnexis brings gym operations, member administration and billing into one workspace for independent gyms and fitness businesses.",
    "path": "/about",
    "label": "About Fitnexis"
  },
  "pricing": {
    "title": "Gym Management Software Pricing & Plans | Fitnexis",
    "description": "Explore Fitnexis gym software plans, published pricing and payment requirements. Understand core administration, optional capabilities and gym onboarding.",
    "path": "/pricing",
    "label": "Pricing"
  },
  "faq": {
    "title": "Gym Software Questions: Payments, Members & Setup | Fitnexis",
    "description": "Answers about Fitnexis gym software: registration, member portals, cash and EFT records, online payments, class bookings and planned features.",
    "path": "/faq",
    "label": "Frequently asked questions"
  },
  "contact": {
    "title": "Book a Gym Software Walkthrough | Contact Fitnexis",
    "description": "Discuss your gym membership, attendance, billing and booking needs with Fitnexis. Request a walkthrough or ask about onboarding your independent gym.",
    "path": "/contact",
    "label": "Contact"
  },
  "find-gym": {
    "title": "Find Your Gym Login | Fitnexis",
    "description": "Find your gym workspace using its unique Fitnexis slug and sign in to your member portal.",
    "path": "/find-gym",
    "label": "Find your gym",
    "noindex": true
  },
  "south-africa": {
    "title": "Gym Management Software in South Africa | Fitnexis",
    "description": "Gym software for South African independent gyms: member records, attendance, ZAR billing, cash and EFT records, class bookings and browser-based portals.",
    "path": "/gym-management-software-south-africa",
    "label": "Gym software in South Africa"
  }
};
