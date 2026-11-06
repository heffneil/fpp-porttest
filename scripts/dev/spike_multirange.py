#!/usr/bin/env python3
"""Throwaway hardware spike for the Port Test plugin (not shipped logic).

Question it answers: does FPP's channel test, given several port ranges joined
by a separator, light ONLY those ports on a real board?

    spike_multirange.py HOST PORT [PORT...] [--sep ';'] [--go] [--stop] [--save PATH]

PORT is the number shown on the Pixel Strings page (portNumber + 1). Without
--go nothing is sent to the board. Channel math here is deliberately naive
(3 channels per pixel, no grouping); the plugin's real math is Task 3.
"""
import argparse
import json
import sys
import urllib.request

DIM_WHITE = "#404040"


def http(method, url, body=None):
    data = None if body is None else json.dumps(body).encode()
    # FPP's API answers a GET that carries a Content-Type header with a 404
    # (seen on a 10.3 board), so only requests with a body get one.
    headers = {} if data is None else {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode()


def command(host, name, args):
    body = {"command": name, "multisyncCommand": False, "multisyncHosts": "", "args": args}
    return body, lambda: http("POST", "http://%s/api/command" % host, body)


def port_ranges(host, config_file, wanted):
    cfg = json.loads(http("GET", "http://%s/api/channel/output/%s" % (host, config_file)))
    out = next(o for o in cfg["channelOutputs"] if isinstance(o, dict) and o.get("enabled"))
    by_number = {p["portNumber"]: p for p in out["outputs"]}
    result = {}
    for shown in wanted:
        port = by_number[shown - 1]
        ranges = []
        for vs in port.get("virtualStrings", []):
            px = int(vs.get("pixelCount") or 0)
            if px > 0:
                start = int(vs["startChannel"])
                ranges.append((start, start + px * 3 - 1))
        if not ranges:
            sys.exit("port %d has no pixels; set a pixel count first" % shown)
        result[shown] = ranges
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("ports", nargs="*", type=int)
    ap.add_argument("--sep", default=";")
    ap.add_argument("--file", default="co-bbbStrings")
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--stop", action="store_true")
    ap.add_argument("--save")
    a = ap.parse_args()

    if a.stop:
        _, send = command(a.host, "Test Stop", [])
        print("Test Stop ->", send())
        print("testing now:", http("GET", "http://%s/api/fppd/testing" % a.host))
        return
    if not a.ports:
        sys.exit("give at least one PORT")

    per_port = port_ranges(a.host, a.file, a.ports)
    flat = [r for shown in a.ports for r in per_port[shown]]
    channel_set = a.sep.join("%d-%d" % r for r in sorted(flat))
    for shown in a.ports:
        print("port %d -> %s" % (shown, ", ".join("%d-%d" % r for r in per_port[shown])))
    body, send = command(a.host, "Test Start", ["1000", "RGB Single Color", channel_set, DIM_WHITE])
    print("channelSet:", channel_set)
    print("body:", json.dumps(body))
    if not a.go:
        print("(dry run: nothing sent)")
        return
    print("Test Start ->", send())
    testing = http("GET", "http://%s/api/fppd/testing" % a.host)
    print("testing now:", testing)
    if a.save:
        with open(a.save, "w") as f:
            f.write(json.dumps(json.loads(testing), indent=2) + "\n")
        print("saved", a.save)


if __name__ == "__main__":
    main()
