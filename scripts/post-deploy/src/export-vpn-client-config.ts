import { writeFileSync } from "fs";

export async function exportVpnClientConfig(terraformOutput: any, AWS: any) {

    const vpnEndpointId = terraformOutput.vpn_endpoint_id.value;
    const vpnEndpointName = terraformOutput.vpn_endpoint_name.value;
    const clientPrivateKey = terraformOutput.vpn_client_private_key.value;
    const clientCertificate = terraformOutput.vpn_client_certificate.value;

    const ec2 = new AWS.EC2();

    const result = await ec2.exportClientVpnClientConfiguration({
        ClientVpnEndpointId: vpnEndpointId
    }).promise();

    const ovpn =
        `${result.ClientConfiguration}

<cert>
${clientCertificate}
</cert>

<key>
${clientPrivateKey}
</key>
`;

    writeFileSync(`../../${vpnEndpointName}.ovpn`, ovpn);

    console.log("OpenVPN client configuration file is written to '" + vpnEndpointName + ".ovpn' in the project root.\nCopy this file to your OpenVPN configuration folder to start creating VPN connections");
}
