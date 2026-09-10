// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HomeWhyChip } from '~/components/casts/HomeWhyChip';

/**
 * Runs in the client's own vitest harness, against the client's own React and
 * Testing Library. What it proves is narrow and specific: Home's kernel is
 * importable from inside the app, the chip renders for every reason the API can
 * send, and tapping it produces controls — the thing the upstream SourceLabel
 * and IncludeReasonTopHat do not do.
 */
describe('HomeWhyChip', () => {
  it('renders a chip for every reason the API can send', () => {
    const reasons = [
      'following-author', 'evergreen-following-author', 'follow-of-follow',
      'recasted-by-following', 'has-reply-by-followed', 'pinned-in-channel',
      'popular-in-channel', 'popular', 'high-quality-unfollowed', 'snap-promoted',
    ] as const;

    for (const type of reasons) {
      const { unmount } = render(
        <HomeWhyChip includeReason={{ type } as never} />,
      );
      const chip = screen.getByTestId('home-why-chip');
      // Upstream renders nothing at all for the two following-author reasons.
      expect(chip.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      unmount();
    }
  });

  it('explains the reason and shows the score when tapped', async () => {
    render(
      <HomeWhyChip includeReason={{ type: 'popular' } as never} score={0.71} />,
    );
    expect(screen.queryByTestId('home-why-sheet')).toBeNull();

    await userEvent.click(screen.getByRole('button'));

    const sheet = screen.getByTestId('home-why-sheet');
    expect(sheet.textContent).toContain('popular right now');
    expect(sheet.textContent).toContain('0.71');
    expect(screen.getByText('Less of this')).toBeTruthy();
    expect(screen.getByText('None of this')).toBeTruthy();
    expect(screen.getByText('More of this')).toBeTruthy();
  });

  it('reports the group and direction the reader chose', async () => {
    const onAdjust = vi.fn();
    render(
      <HomeWhyChip
        includeReason={{ type: 'high-quality-unfollowed' } as never}
        onAdjust={onAdjust}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Less of this'));
    expect(onAdjust).toHaveBeenCalledWith('discovery', 'down');
  });

  it('never offers to boost promoted content', async () => {
    render(<HomeWhyChip includeReason={{ type: 'snap-promoted' } as never} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Less of this')).toBeTruthy();
    expect(screen.getByText('None of this')).toBeTruthy();
    expect(screen.queryByText('More of this')).toBeNull();
  });

  it('labels an unknown future reason rather than rendering nothing', () => {
    render(<HomeWhyChip includeReason={{ type: 'brand-new-reason' } as never} />);
    expect(screen.getByTestId('home-why-chip').textContent).toContain(
      'brand-new-reason',
    );
  });
});
