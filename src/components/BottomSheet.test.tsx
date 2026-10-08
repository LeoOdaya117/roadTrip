import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BottomSheet from './BottomSheet';

afterEach(() => {
  document.body.style.overflow = '';
});

describe('BottomSheet', () => {
  it('keeps the footer separate from the scrollable body and locks background scrolling', () => {
    render(
      <BottomSheet
        isOpen
        ariaLabel="Map style and details"
        onDidDismiss={vi.fn()}
        footer={<button type="button">Done</button>}
      >
        <div>Scrollable map details</div>
      </BottomSheet>,
    );

    const sheet = screen.getByRole('dialog', { name: 'Map style and details' });
    expect(sheet.querySelector('.sheet-inner')).toHaveTextContent('Scrollable map details');
    expect(sheet.querySelector('.custom-sheet-footer')).toContainElement(screen.getByRole('button', { name: 'Done' }));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('dismisses on Escape and restores focus to the control that opened it', () => {
    const onDidDismiss = vi.fn();
    const Harness = () => {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Open sheet</button>
          <BottomSheet isOpen={isOpen} onDidDismiss={() => { onDidDismiss(); setIsOpen(false); }}>
            <button type="button">Close action</button>
          </BottomSheet>
        </>
      );
    };
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Close action' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDidDismiss).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses when the backdrop is tapped', () => {
    const onDidDismiss = vi.fn();
    render(<BottomSheet isOpen onDidDismiss={onDidDismiss}>Sheet</BottomSheet>);

    fireEvent.click(document.body.querySelector('.custom-sheet-backdrop')!);

    expect(onDidDismiss).toHaveBeenCalledOnce();
  });
});
