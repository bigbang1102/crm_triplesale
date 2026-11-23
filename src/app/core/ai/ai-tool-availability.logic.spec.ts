import { describe, expect, it } from 'vitest';
import { unavailableTools, type ToolsInfo } from './ai-tool-availability.logic';

const IDS = ['doc-analyze', 'image', 'video', 'voiceover', 'gif', 'music'] as const;
const served = (...ids: string[]): ToolsInfo => ({
  tools: ids.map((id) => ({ id })),
  image: { enabled: true },
  video: { renderEnabled: true },
  music: { vocals: true },
});

describe('unavailableTools', () => {
  it('should grey the music tool while the service cannot sing (no Lyria key), and open it when it can', () => {
    const none: ToolsInfo = { ...served('music'), music: { vocals: false } };
    expect(unavailableTools(['music'], none, null)).toEqual({ music: 'no-vocals' });
    const missing: ToolsInfo = { tools: [{ id: 'music' }] };
    expect(unavailableTools(['music'], missing, null)).toEqual({ music: 'no-vocals' });
    expect(unavailableTools(['music'], served('music'), null)).toEqual({});
  });

  it('should judge nothing while the service has not answered', () => {
    expect(unavailableTools(IDS, null, { enabled: false })).toEqual({});
  });

  it('should grey the customer brief: the app does not give the service the customer data yet', () => {
    const info = served('doc-analyze', 'image', 'video', 'voiceover', 'music');
    expect(unavailableTools(['customer-brief'], info, { enabled: true })).toEqual({
      'customer-brief': 'not-wired',
    });
  });

  it('should be empty when every tool is served and switched on', () => {
    const info = served('doc-analyze', 'image', 'video', 'voiceover', 'music');
    expect(unavailableTools(IDS, info, { enabled: true })).toEqual({});
  });

  it('should grey the voice-over while neither Azure nor Google has a key', () => {
    const info = served('doc-analyze', 'image', 'video', 'voiceover', 'music');
    expect(unavailableTools(IDS, info, { enabled: false })).toEqual({
      voiceover: 'not-configured',
    });
  });

  it('should not judge the voice-over when its status is unknown', () => {
    const info = served('doc-analyze', 'image', 'video', 'voiceover', 'music');
    expect(unavailableTools(IDS, info, null)).toEqual({});
  });

  it('should grey a tool the service does not have', () => {
    const info = served('doc-analyze', 'image', 'video', 'voiceover');
    expect(unavailableTools(IDS, info, { enabled: true })).toEqual({ music: 'not-installed' });
  });

  it('should grey image, video and the GIF maker (it draws its frames with the image tool) when image rendering is off', () => {
    const info: ToolsInfo = {
      ...served('doc-analyze', 'image', 'video', 'voiceover', 'music'),
      image: { enabled: false },
    };
    expect(unavailableTools(IDS, info, { enabled: true })).toEqual({
      image: 'not-configured',
      gif: 'not-configured',
    });
  });

  it('should grey the clip maker when video rendering is off', () => {
    const info: ToolsInfo = {
      ...served('doc-analyze', 'image', 'video', 'voiceover', 'music'),
      video: { renderEnabled: false },
    };
    expect(unavailableTools(IDS, info, { enabled: true })).toEqual({ video: 'not-configured' });
  });
});
