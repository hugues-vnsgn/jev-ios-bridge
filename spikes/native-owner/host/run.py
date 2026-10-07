#!/usr/bin/env python3
"""CLI for the same run_study Interface used by the regression suite."""
import argparse
import json
from pathlib import Path
from study import Configuration, Dependencies, ProcessTools, run_study


def main():
    parser=argparse.ArgumentParser(description="Owned no-input native observations; no capability claims")
    parser.add_argument("--plan",choices=("metadata","reference-study"),default="metadata")
    parser.add_argument("--derived-data",type=Path,required=True)
    parser.add_argument("--evidence-directory",type=Path,required=True)
    parser.add_argument("--admission-seconds",type=float,default=90)
    args=parser.parse_args()
    configuration=Configuration(args.derived_data.resolve(),args.evidence_directory.resolve(),
                                Path(__file__).resolve().parent.parent,args.admission_seconds)
    tools=ProcessTools(configuration.evidence_directory/"process-output")
    result=run_study(args.plan,configuration,Dependencies(tools))
    # Raw native observations stay in local evidence, never normal CLI output.
    print(json.dumps({"status":result.status,"reason":result.reason,
                      "requestId":result.request_id,"evidenceDirectory":result.evidence_directory,
                      "retainedResources":result.retained_resources},indent=2))
    return {"completed":0,"refused":2,"retained":3}[result.status]


if __name__=="__main__":
    raise SystemExit(main())
