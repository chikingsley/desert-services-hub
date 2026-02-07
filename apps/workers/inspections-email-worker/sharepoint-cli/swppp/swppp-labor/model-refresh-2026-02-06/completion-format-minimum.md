# SWPPP Completion Format (Minimum)

Use this one line at the top of every completion note.

## Required Fields

`crew=<number>; duration=<hours>; task=<short label>`

## Strongly Recommended Fields

Add any quantities that apply:

- `install_panels=<count>`
- `relocate_panels=<count>`
- `remove_panels=<count>`
- `install_sock_lf=<feet>`
- `relocate_sock_lf=<feet>`
- `install_silt_fence_lf=<feet>`
- `install_privacy_lf=<feet>`
- `inlets=<count>`
- `rock_entrance=<count>`
- `grates=<count>`
- `trackout_tons=<tons>`
- `signs=<count>`
- `stickers=<count>`
- `delivery=1` (or `0`)
- `mobilization=<count>`
- `trip_charge=<count>`

If rock/trackout work was done, include specialist time:

- `tractor_hours=<hours>`
- `dumptruck_hours=<hours>`

## Examples

Fence + privacy:

`crew=4; duration=5.0h; task=temp_fence_install; install_panels=220; install_privacy_lf=2600`

Sock + inlet:

`crew=3; duration=3.5h; task=bmp_install; install_sock_lf=1200; inlets=8`

Rock entrance:

`crew=2; duration=4.0h; task=rock_entrance_install; rock_entrance=2; trackout_tons=44; grates=2; tractor_hours=2.0; dumptruck_hours=2.5`

Narrative only:

`crew=1; duration=1.5h; task=narrative`

## Notes

- Keep any normal narrative text after this line.
- Do this going forward; no need to backfill old rows immediately.
- If exact quantity is unknown, put best estimate and mark with `(est)` in narrative text.
