// Standardized activity types — single source of truth for Leads, Pipeline, and Deals modules.
// Same order, same labels, same keys everywhere.
export const ACTIVITY_TYPES = [
  { key: "follow_up_call",  label: "Follow-up Call"      },
  { key: "follow_up_email", label: "Follow-up Email"     },
  { key: "call",            label: "Call"                 },
  { key: "email",           label: "Email"                },
  { key: "meeting_person",  label: "Meeting (In Person)"  },
  { key: "meeting_virtual", label: "Meeting (Virtual)"    },
  { key: "note",            label: "Note"                 },
];

export default ACTIVITY_TYPES;
