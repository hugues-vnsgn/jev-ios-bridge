# Evidence audit for dadde33a

This reviewer read Source and retained raw evidence. The audit script performs file hashing and read-only git inspection. It ran no candidate test/build or native/system/device/store/config/key/SDK query. Results are in source-audit.json, receipt-audit.json and input-manifest.json; candidate.diff and snapshots preserve the reviewed delta and critical Source/fixture bytes.

## Binding

All 441 working files and 441 candidate commit files matched the frozen vector. All 439 base files and 437 protected files matched the exact base. Four changed paths match owned4, context and the postcommit manifest. The shared fixture differs solely by the exact slash, private prefix and leading owned root identity branches; every other byte, including the accepted Xcode guard, is exact. Both original observed-layout test bodies occur verbatim in the final suite. Both final build vectors and actual compiled snapshots match all 69 hashes; 68 match base. Only allocation-config.js differs. Current dist also matched all 69 hashes.

All 46 retained command receipts have matching raw stdout/stderr hashes and available byte counts. All 44 verification-index receipt pins match. The eight final focused/typecheck/coverage/build receipts and actual default26/runtime26 receipts bind the same 441 Source hashes and owned4 vector. Runtime receipts retain v26.8.1 and exact v24.0.0. Default26 uses exact npm run check, fixed empty npm user/global config environment, and no extra test flags, Node overrides or credential variables. The unchanged check ran typecheck followed by the complete npm test script; 127 failures stopped it before build. The prior successful builds on both Nodes remain separate evidence.

## Retained reds and failures

Initial observed-layout red: 2 tests, 0 pass, 2 fail on both Nodes. Its unchanged base Source SHA is 82140b7f019e6031597b678669d8f491d414a0eaf43e403cf49fde68fd370026. Initial reconstructed test SHA 43f16147dc7e0e8145ff198340799c6d0fc3520205658c52520732f63e9d6aaa and fixture SHA a2a3179081b8e9e9ccc21b5b3706eae29bfa10bf1a2569df1ffb4ad13d6dbd53 match both receipt pins. Those bytes were reconstructed after extensions and are noncontemporaneous. First-green Source was saved contemporaneously and matches both first-green receipt hashes. Initial errors are HOST_PREREQUISITE_MISSING and Host process is not authorized, with no import or syntax error.

Pure mapping reds were 3/0/3, then 5/0/5 before the narrow edit. The nominal mapping-green 5/3/2 receipts preserve the production reds until Source repair. First green was 5/5 on both Nodes; policy focused was 133/133 each. Original accidentally overlapping focused runs remain 349 tests, 347 pass, 1 fail, 1 cancelled each. The shared owned temporary mapping regression remains 8 tests, 3 pass, 5 fail followed by 8/8 both. The new fixture's analogous 1/0/1 regression and first failed correction are preserved, followed by 1/1 both. Later serial 477/477 and final 491/491 runs are distinct receipts. The retained cleanup records identify six owned processes, SIGTERM only, and actual close; this reviewer queried or terminated no process.

Root's first26-check and overlap9-check audits are preliminary. Coverage340 is supplementary. Default26 failed 1,985 tests / 1,858 pass / 127 fail with zero cancelled/skipped/todo. Root held Node24, so this candidate has no completed default pair. Root classified a public fixture native filesystem escape; the fake Source refused a metadata child dispatch. These failures provide no reason to weaken the production policy.

## Receipt ledger

Counts order: tests/pass/fail/cancelled/skipped/todo. N/A denotes a non-testcommand. Exactargv/envnames/time/Sourcearchivecorrespondence/rawfailuresections arein receipt-audit.json.

| Command | Exit | Counts | Receipt SHA256 |
| --- | --- | --- | --- |
| actual-default-node26 | 1 | 1985/1858/127/0/0/0 | 02c92c11b6b376ec1d1680bf1bf153e4ee3222870d9a7166f5139a59b1d103e5 |
| actual-runtime-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | b4d93cbecf5b4254ad36441b07ae3308b476d1649bbc5522d388b7aa55955798 |
| build-final-node24 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 2251fb87e23b864bbf2379c6833f87a63d220a7c5c3be999187a46b015484b64 |
| build-final-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 16b8af168f4c34571c19d5bce4eda894ad1a3fa9e9b9844194cfb67787c19a12 |
| build-v1-node24 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 024c4ba069ec8c9d949a08a75f5347a504a9e173d6c5ae1d804c960fde96171a |
| build-v1-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | bc136e6a21a796e82e1a1f182cbc27b5414413fbfbdf093e833ffd62ed216fc5 |
| coverage-final-node24 | 0 | 340/340/0/0/0/0 | 8f28b4de719c472ba7346db18551bd79b9a0e2a9130a7eb8f86b888d3f09b8b0 |
| coverage-final-node26 | 0 | 340/340/0/0/0/0 | f5875585ff7f62e7430b99119cb1df86e385bea0ddfe2562e061f50a7033b864 |
| coverage-v1-node24 | 0 | 326/326/0/0/0/0 | 3aa77bfed0bd29a2986ed3aee950d47a0a9299d1a10383a3fc89fc783f831dc2 |
| coverage-v1-node26 | 0 | 326/326/0/0/0/0 | e57729eb08793ee53bd1915e7d9a21375e73102876985f2b722ede781b2adc73 |
| first-green-node24 | 0 | 5/5/0/0/0/0 | 7b4c3558977eaf63552c281b1b526786294d62aeb390b54168cea2dc1c693b7c |
| first-green-node26 | 0 | 5/5/0/0/0/0 | 77a2cd44269f15f57868fc64443c24c8a8e8ba810747181db34de8f7eccc0c3b |
| focused-final-node24 | 0 | 491/491/0/0/0/0 | 794c0b3e1dc8b90b534af8d3d74bc0111324ca7ff827fbc50e2ad10543b97e56 |
| focused-final-node26 | 0 | 491/491/0/0/0/0 | 0cc333a40977bd9afffa87ae69c96b8bb190b7d0c33fad125ca6a1e8fb96bd16 |
| focused-serial-node24 | 0 | 477/477/0/0/0/0 | ed2129fd3d1636562f5cd66d1e46ff9001928b764c5bb945995468c0ea856091 |
| focused-serial-node26 | 0 | 477/477/0/0/0/0 | ab6e7b1b8f278e9d358a527bded4f618cac4dc82ea295c759b44290a636fe02e |
| focused-v2-node24 | 1 | 349/347/1/1/0/0 | 742c6ab3a3c6b9793a5dfb7bfc09390cca950b437b0872f9b01f69aaa1121136 |
| focused-v2-node26 | 1 | 349/347/1/1/0/0 | 35ac1c280b620d9f87616c4821a7652cd5c3353a6bc7d79ee9b16b5b4095ecf3 |
| mapping-green-node24 | 1 | 5/3/2/0/0/0 | 633e31477bbb8a3ccef4bf17a8a1783e6a6b04db3c1be5eb66c5bd0f89be0acf |
| mapping-green-node26 | 1 | 5/3/2/0/0/0 | 0d80b4a40615a3667c318a259f9976c487df9add8b7b1039272aae61744ad9bd |
| mapping-red-complete-node24 | 1 | 5/0/5/0/0/0 | 0b29aa06bc899ca7c728f71a59c95628c9cb25b8d86a895fe890ed42126d2e0b |
| mapping-red-complete-node26 | 1 | 5/0/5/0/0/0 | 176db72b22921b4a2ce4ab7575ab473430ac712d39b4478c9f8eb5425e5632f3 |
| mapping-red-node24 | 1 | 3/0/3/0/0/0 | 0b5d6427a95480a1c6ffbf60e77009f46ab2056f64d2cf403a53255e2cb6ab47 |
| mapping-red-node26 | 1 | 3/0/3/0/0/0 | 7af06ba20410bc09d26fe167a69b64e3ec67f6747207a09b17e32e1436f3df44 |
| npm-ci | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 8294290b6cab16c94449d54810cf5c2f27ff475dfc082dd4c83c6ec174f95353 |
| own-temp-map-green-node24 | 1 | 1/0/1/0/0/0 | 627baea71e85a6b1ef38cf15b579da8aa4e4261245882d1cb8080331eaf93f5e |
| own-temp-map-green-node26 | 1 | 1/0/1/0/0/0 | c9b73bdc12b3cf6df49e3a4b7852a4e1e72f4c970d0bcfb59c74160269238686 |
| own-temp-map-green2-node24 | 0 | 1/1/0/0/0/0 | e7c8fd2ce0347b789643826f7d83c153c573cf73ee2a9ccfce31344978032ccd |
| own-temp-map-green2-node26 | 0 | 1/1/0/0/0/0 | 1cad0895f59634e9e5ea69e401cc4bd8aa4eba0b74256ca8a5a775fb7f27c154 |
| own-temp-map-red-node24 | 1 | 1/0/1/0/0/0 | c53b1be7ccf4bc87e6cce09af01818c9a6545bdfa65cb974bb2fe9179c51c016 |
| own-temp-map-red-node26 | 1 | 1/0/1/0/0/0 | 7679648fc958d3f5e23d77c2c90ac910783071d7a54b36e42cf4603dd179e6d1 |
| policy-focused-v1-node24 | 0 | 133/133/0/0/0/0 | 6f09cfa09c0c794d4b2658b0885c0822c34a2fb63f0b51328882e5cd7e221000 |
| policy-focused-v1-node26 | 0 | 133/133/0/0/0/0 | 3061efe58b84558795b3bb2db21a9531c944ba087b38c3ecbc24de10959b633a |
| red-node24 | 1 | 2/0/2/0/0/0 | 66f0c4a1486870a19506261d3c2f4b48d70eb0fc2abe879e38c88f8fbcce6a31 |
| red-node26 | 1 | 2/0/2/0/0/0 | bf13524900893f01ac1b0d1cd192f7eaea2133332792545fbc20be3f6d9d3145 |
| runtime-node24 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 4c6720fd1ba30f551691f19b96fee8fa9aa3a2678f4e766d3c074f62e6b31776 |
| runtime-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 1fcacbdfef28884fd38b5ef45277e576465ff5735e994b45ad6d253f3a17c8e2 |
| runtime-npm | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 96a968b5cdc1a7398fbf4b681630d932ac12756d68b88f8baa391e4ec2539978 |
| temp-map-green-node24 | 0 | 8/8/0/0/0/0 | 582a908ae6a0fd7d8e7436dbd31a6c5b22d8c50522d2a0205400520763b8a4f9 |
| temp-map-green-node26 | 0 | 8/8/0/0/0/0 | 9e4d5e86857de15647406c67d7af85b746c94c2e6890a1069d51049e92c3d741 |
| temp-map-red-node24 | 1 | 8/3/5/0/0/0 | 59f1956357ffbaa28c46eec29f7c6c756884c84f715a14184015807a6722623c |
| temp-map-red-node26 | 1 | 8/3/5/0/0/0 | 655447710d69977281d680f672645c827b2bfc5a8bec1d29e06c27f7e7aaaa33 |
| typecheck-final-node24 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | c00edfaeb4800d5293d6156dbda70a343fa1889f1f8d75b4988d09ff43ca071f |
| typecheck-final-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 6e3d608d93c511fa9f6750fca79dd52c38e1c9507e7688c56d31553a496598eb |
| typecheck-v1-node24 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 48c30c85045bd857edc50dff46b4c402e743c621b5f6867d1a2448c3283efcf0 |
| typecheck-v1-node26 | 0 | N/A/N/A/N/A/N/A/N/A/N/A | 419e5f5758cb72a4571906cd7be0ba5a3e071e7195c5e490bbceae5611c70d2e |
