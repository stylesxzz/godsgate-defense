# USB deployment

The project provides an enrollment bundle for preparing a removable installation kit. It does **not** silently format a drive or claim that a browser can write a boot sector.

## Build the kit

From the repository root on Linux:

```bash
chmod +x usb/build-ubuntu-usb.sh
./usb/build-ubuntu-usb.sh "https://YOUR-SERVER/api/agent/bootstrap/ONE_TIME_CODE"
```

The script creates `GodsGate-USB-Kit.tar.gz`. It contains the agent, Linux and Windows installers, and the one-time enrollment URL.

## Create bootable media

1. Prepare the pendrive with Ventoy or another trusted boot-media utility, following that utility's instructions. Preparing boot media can erase the selected USB device.
2. Copy the official Ubuntu Server ISO and the God’s Gate USB kit onto the USB data partition.
3. Boot the target computer from the USB and install Ubuntu manually. Do not select a disk or unattended-install option you do not understand.
4. After the OS has internet access, unpack the kit and run `sudo bash install.sh "$(cat enrollment.url)"`.

The installer registers the telemetry agent as a systemd service. It does not install a kernel module, change firewall rules, or perform disk partitioning.

For machines that already run Linux or Windows, skip the bootable-media step and use the enrollment command shown in the admin console.
