import { SchedulerService } from '../src/services/schedulerService';

describe('SchedulerService Recipient Parser', () => {
  it('should parse valid comma-separated and newline-separated emails', () => {
    const csvContent = `
john.doe@example.com, alice.smith@domain.co
bob@testing.io
    `;

    const result = SchedulerService.parseRecipients(csvContent);
    expect(result.validEmails).toEqual([
      'john.doe@example.com',
      'alice.smith@domain.co',
      'bob@testing.io',
    ]);
    expect(result.duplicateCount).toBe(0);
    expect(result.invalidCount).toBe(0);
  });

  it('should deduplicate repeated email addresses', () => {
    const content = `
repeat@example.com
user1@test.com
repeat@example.com
repeat@example.com
    `;

    const result = SchedulerService.parseRecipients(content);
    expect(result.validEmails).toHaveLength(2);
    expect(result.validEmails).toContain('repeat@example.com');
    expect(result.validEmails).toContain('user1@test.com');
    expect(result.duplicateCount).toBe(2);
  });

  it('should filter out invalid strings and headers', () => {
    const content = `
email
not-an-email
valid.user@reachinbox.ai
invalid@@domain..com
    `;

    const result = SchedulerService.parseRecipients(content);
    expect(result.validEmails).toEqual(['valid.user@reachinbox.ai']);
    expect(result.invalidCount).toBe(2);
  });
});
