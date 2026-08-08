# FixNow User Journey Maps

## Overview
This document defines enterprise-grade user journey maps for:
1. Customer
2. Technician
3. Admin

---

# CUSTOMER JOURNEYS

## Primary Journey: Registration

Goal: Create account and access marketplace

Emotional State:
- Curious
- Hopeful
- Slight uncertainty

Journey Diagram:

Visitor
→ Choose Customer
→ Register
→ Verify Phone
→ Complete Profile
→ Dashboard

Decision Points:
- OTP valid?
- Profile complete?

Success Path:
Registration successful

Failure Path:
Invalid OTP → Retry

---

## Primary Journey: Find Technician

Goal:
Find trusted technician

Customer
→ Search
→ Filter
→ View Profiles
→ Compare
→ Select Technician

Decision Points:
- Verified?
- Good reviews?
- Available?

Success:
Suitable technician found

Failure:
No technician available

---

## Primary Journey: Post Job

Goal:
Receive technician applications

Customer
→ Post Job
→ Add Description
→ Upload Photos
→ Select Category
→ Publish

Decision:
Job valid?

Success:
Job visible to technicians

Failure:
Incomplete information

---

## Primary Journey: Hire Technician

Customer
→ Review Applications
→ Compare Technicians
→ Check Trust Scores
→ Assign Technician
→ Notify Technician

Success:
Technician accepts

Failure:
Technician declines

---

## Primary Journey: Complete Service

Customer
→ Track Progress
→ Receive Completion Request
→ Inspect Work
→ Confirm Completion
→ Leave Review

Success:
Job closed

Failure:
Dispute raised

---

## Secondary Journeys

- Save Technician
- Message Technician
- Rehire Technician
- Edit Job
- Cancel Job

---

## Edge Cases

- Technician stops responding
- Customer changes scope
- Duplicate job posting
- Fake review attempt
- Customer account suspension

---

# TECHNICIAN JOURNEYS

## Primary Journey: Registration

Goal:
Join marketplace

Technician
→ Register
→ Create Profile
→ Select Skills
→ Upload Documents

Decision:
Profile complete?

Success:
Profile created

Failure:
Missing information

---

## Primary Journey: Verification

Technician
→ Upload National ID
→ Upload Certifications
→ Submit Verification

Admin
→ Review

Decision:
Approved?

Success:
Verified badge

Failure:
Rejected

---

## Primary Journey: Receiving Jobs

Technician
→ Dashboard
→ View Recommended Jobs
→ Open Job

Decision:
Interested?

Success:
Apply

Failure:
Ignore

---

## Primary Journey: Winning Jobs

Technician
→ Submit Application
→ Customer Reviews
→ Customer Assigns

Decision:
Selected?

Success:
Job awarded

Failure:
Application rejected

---

## Primary Journey: Completing Jobs

Technician
→ Start Work
→ Update Progress
→ Complete Work
→ Request Confirmation

Customer
→ Confirm

Success:
Review received

Failure:
Customer disputes

---

## Primary Journey: Lock Threshold

Technician
→ Apply To Jobs
→ Reach Free Limit
→ Account Locked

Decision:
Upgrade?

Success:
Subscription activated

Failure:
Cannot apply

---

## Secondary Journeys

- Portfolio updates
- Responding to messages
- Updating availability
- Managing reviews

---

## Edge Cases

- Verification fraud
- Fake certificates
- Multiple accounts
- Job abandonment
- Trust score decline

---

# ADMIN JOURNEYS

## Primary Journey: Manage Technicians

Admin
→ Search Technician
→ Review Profile
→ Review Performance
→ Action

Actions:
- Approve
- Suspend
- Ban
- Unlock

Success:
Status updated

---

## Primary Journey: Verification

Technician Submission
→ Verification Queue
→ Document Review
→ Approve/Reject

Decision:
Valid documents?

Success:
Verified

Failure:
Rejected

---

## Primary Journey: Manage Jobs

Admin
→ Review Jobs
→ Investigate Reports
→ Moderate Content

Decision:
Violation?

Success:
Job remains active

Failure:
Job removed

---

## Primary Journey: Lock Management

Admin
→ View Locked Technicians
→ Review Usage
→ Override Rules

Decision:
Unlock?

Success:
Technician restored

Failure:
Remain locked

---

## Secondary Journeys

- Manage categories
- Configure trust score rules
- Review analytics
- Handle disputes

---

## Edge Cases

- Fraud ring detected
- Mass fake reviews
- Abuse reports spike
- System outage
- Escrow dispute escalation

---

# CUSTOMER EMOTIONAL MAP

Discovery → Curious
Search → Hopeful
Comparison → Analytical
Hiring → Confident
Completion → Satisfied

Failure States:
Frustrated
Confused
Distrustful

---

# TECHNICIAN EMOTIONAL MAP

Registration → Motivated
Verification → Anxious
Application → Optimistic
Assignment → Excited
Completion → Proud

Failure States:
Rejected
Locked
Frustrated

---

# ADMIN EMOTIONAL MAP

Monitoring → Focused
Verification → Analytical
Moderation → Cautious
Escalations → High Attention

---

# SUCCESS METRICS

Customer:
- Job completion rate
- Satisfaction score
- Repeat bookings

Technician:
- Win rate
- Completion rate
- Reputation growth

Admin:
- Verification turnaround
- Fraud reduction
- Platform trust score

