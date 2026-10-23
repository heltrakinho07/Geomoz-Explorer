import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SidebarResize, useSidebarWidth } from './SidebarResize';
function Panel() { const panel = useSidebarWidth('test-width', 320); return <SidebarResize panel={panel} />; }
beforeEach(() => { localStorage.clear(); window.innerWidth = 1200; });
afterEach(cleanup);
it('supports keyboard resizing, persistence, viewport limits and reset', () => {
  const view = render(<Panel />);
  const width = () => screen.getByRole('separator').getAttribute('aria-valuenow');
  fireEvent.keyDown(screen.getByRole('separator'), {key:'ArrowRight', shiftKey:true});
  expect(width()).toBe('360');
  view.unmount(); render(<Panel />); expect(width()).toBe('360');
  fireEvent.keyDown(screen.getByRole('separator'), {key:'End'}); expect(width()).toBe('640');
  window.innerWidth = 800; fireEvent(window, new Event('resize')); expect(width()).toBe('480');
  fireEvent.keyDown(screen.getByRole('separator'), {key:'Home'}); expect(width()).toBe('260');
  fireEvent.doubleClick(screen.getByRole('separator')); expect(width()).toBe('320');
});
