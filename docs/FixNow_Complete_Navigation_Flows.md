# FixNow Complete Navigation Flow Diagrams

## Overview

This document contains complete navigation flow diagrams for:
- Customer
- Technician
- Admin

Includes:
- Normal flows
- Error flows
- Empty states
- Notification-driven flows
- Deep linking flows

---

# CUSTOMER NAVIGATION FLOWS

## Registration Flow

Landing Page
→ Login
OR
→ Sign Up
→ Select Customer
→ Enter Details
→ OTP Verification
→ Dashboard

Error:
Invalid OTP
→ Retry
→ Resend OTP

---

## Dashboard Navigation

Dashboard
├── Search Technicians
├── Post Job
├── Active Jobs
├── Saved Technicians
├── Messages
├── Notifications
├── Profile
└── Settings

---

## Search Technician Flow

Dashboard
→ Search Technicians
→ Filters
→ Technician Results
→ Technician Profile
→ Book Technician

Actions:
- View Reviews
- View Portfolio
- Message
- Save
- Book

---

## Direct Booking Flow

Technician Profile
→ Book Technician
→ Select Date
→ Select Time
→ Describe Work
→ Upload Photos
→ Submit Request

Success:
Accepted
→ Active Job

Failure:
Declined
→ Search Again

---

## Job Posting Flow

Dashboard
→ Post Job
→ Select Category
→ Description
→ Upload Photos
→ Set Location
→ Publish

Success:
Job Published

Failure:
Validation Errors
→ Fix Fields

---

## Application Review Flow

Open Job
→ Applications
→ Application Detail
→ Technician Profile
→ Assign Technician

Success:
Job Assigned

Failure:
Reject Application

---

## Service Completion Flow

Assigned Job
→ In Progress
→ Completion Request
→ Inspect Work
→ Confirm Completion
→ Rate Technician
→ Completed

Failure:
Raise Dispute

---

# CUSTOMER EMPTY STATES

No Technicians Found
→ Expand Search
→ Remove Filters
→ Post Job

No Applications
→ Wait
→ Edit Job
→ Promote Job

No Messages
→ Start Conversation

---

# CUSTOMER NOTIFICATION FLOWS

Notification
→ New Application
→ Applications Page

Notification
→ New Message
→ Chat Screen

Notification
→ Technician Accepted
→ Active Job

Notification
→ Job Completed
→ Completion Screen

Notification
→ Review Reminder
→ Review Form

---

# CUSTOMER DEEP LINKS

/technician/{id}
/job/{id}
/application/{id}
/message/{threadId}
/review/{id}

---

# TECHNICIAN NAVIGATION FLOWS

## Registration Flow

Landing
→ Sign Up
→ Select Technician
→ Enter Details
→ Skills
→ Categories
→ Dashboard

---

## Verification Flow

Dashboard
→ Verification Center
→ Upload ID
→ Upload Certificates
→ Upload Selfie
→ Submit

Success:
Verified Badge

Failure:
Rejected
→ Resubmit

---

## Job Discovery Flow

Dashboard
→ Recommended Jobs
→ Job Details

Actions:
- Apply
- Save
- Ignore

---

## Application Flow

Job Details
→ Apply
→ Proposal
→ Timeline
→ Estimated Cost
→ Submit

States:
Pending
Accepted
Rejected

---

## Job Execution Flow

Assigned Job
→ Accept Assignment
→ Start Work
→ Progress Updates
→ Upload Completion Photos
→ Mark Complete
→ Await Confirmation

Success:
Review Received

Failure:
Dispute

---

## Lock Threshold Flow

Technician Dashboard
→ Application Counter
→ Limit Reached
→ Account Locked

Options:
- Upgrade Subscription
- Request Review
- Wait For Reset

---

# TECHNICIAN EMPTY STATES

No Jobs Available
→ Expand Radius
→ Add Skills
→ Improve Profile

No Reviews
→ Complete Jobs

No Portfolio
→ Add Project

---

# TECHNICIAN NOTIFICATION FLOWS

Notification
→ New Job Match
→ Job Detail

Notification
→ Application Accepted
→ Assigned Job

Notification
→ New Message
→ Chat

Notification
→ Verification Approved
→ Verification Center

Notification
→ Lock Warning
→ Subscription Page

---

# TECHNICIAN DEEP LINKS

/job/{id}
/application/{id}
/message/{threadId}
/verification/{id}
/subscription

---

# ADMIN NAVIGATION FLOWS

## Dashboard

Admin Dashboard
├── Users
├── Jobs
├── Verification
├── Trust Center
├── Reports
├── CMS
├── Lock Management
└── Settings

---

## Verification Management

Verification Queue
→ Open Submission
→ Review Documents

Approve
→ Verified

Reject
→ Resubmission

---

## Technician Management

Technicians
→ Search
→ Profile
→ Performance
→ Trust Metrics

Actions:
- Approve
- Suspend
- Ban
- Unlock

---

## Job Moderation

Jobs
→ Flagged Jobs
→ Job Detail

Actions:
- Approve
- Remove
- Investigate
- Escalate

---

## Lock Management

Locked Technicians
→ Review Usage
→ Unlock
OR
→ Keep Locked

---

# ADMIN ERROR FLOWS

Fraud Detection
→ Investigation
→ Suspend
→ Ban

Fake Verification
→ Reject
→ Request More Documents

Mass Abuse Reports
→ Moderation Queue
→ Restriction
→ Ban

---

# ADMIN NOTIFICATION FLOWS

Notification
→ Verification Pending

Notification
→ Fraud Alert

Notification
→ Abuse Report

Notification
→ Escrow Dispute

---

# GLOBAL DEEP LINK ARCHITECTURE

/technician/{id}
/job/{id}
/application/{id}
/message/{threadId}
/review/{id}
/verification/{id}
/subscription
/notification/{id}

---

# MASTER MARKETPLACE FLOW

Customer
→ Search Technician
→ Book Technician

OR

Customer
→ Post Job
→ Technicians Apply
→ Assign Technician
→ Work Starts
→ Work Completed
→ Review Submitted

Technician
→ Discover Jobs
→ Apply
→ Win Job
→ Complete Job
→ Increase Reputation

Admin
→ Verify
→ Moderate
→ Manage Trust
→ Manage Locks
→ Maintain Marketplace Health
