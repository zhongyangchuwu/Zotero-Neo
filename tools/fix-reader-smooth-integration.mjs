import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/unit/reader-controller.test.ts';
let source = readFileSync(path, 'utf8');
const before = `    runSmoothFrame(created, 16);
    const accelerated = created.container.scrollBy.mock.calls[1]?.[0] as number;
    expect(accelerated).toBeGreaterThan(14.4);

    const repeat = readerKey('l');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    releaseSmoothHold(created, 'l');
    runSmoothFrame(created, 32);
    const decelerating = created.container.scrollBy.mock.calls[2]?.[0] as number;
    expect(decelerating).toBeGreaterThan(0);
    expect(decelerating).toBeLessThan(accelerated);
`;
const after = `    runSmoothFrame(created, 16);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    const repeat = readerKey('l');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    releaseSmoothHold(created, 'l');
    runSmoothFrame(created, 32);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(3);
`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`smooth integration patch: expected 1 anchor, found ${count}`);
source = source.replace(before, after);
writeFileSync(path, source);
