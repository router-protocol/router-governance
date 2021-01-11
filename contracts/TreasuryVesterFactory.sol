pragma solidity >=0.6.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TreasuryVester.sol";

contract TreasuryVesterFactory is Ownable{
    
    struct VestingInfo {
        address vester;
        uint amount;
    }
    event Vested(address indexed user, address indexed vestingContract);

    mapping (address => VestingInfo) public userVestingInfo;
    
    address[] public recipients;
    address public route;

    constructor (address _route) public {
        route = _route;
    }

    function vest(
        address recipient,
        uint vestingAmount,
        uint vestingCliff,
        uint vestingEnd,
        uint bonus
    ) public onlyOwner {
        VestingInfo storage info = userVestingInfo[recipient]; 
        require(info.vester == address(0), "TreasuryVesterFactory::vest: already vesting");
        TreasuryVester vester = new TreasuryVester(
            address(this),
            route,
            recipient,
            vestingAmount,
            vestingCliff,
            vestingEnd,
            bonus
        );

        info.vester = address(vester);
        info.amount = vestingAmount;
        recipients.push(recipient);
        emit Vested(recipient, info.vester);
    }

    function batchVest( 
        address[] calldata recipient,
        uint[] calldata vestingAmounts,
        uint[] calldata  vestingCliff,
        uint[] calldata vestingEnd,
        uint[] calldata bonus
    ) external onlyOwner {

        require(
            recipient.length > 0 && 
            recipient.length == vestingAmounts.length && 
            vestingCliff.length == vestingEnd.length, 
            'TreasuryVesterFactory::claimAll: called before any deploys'
        );

        for (uint i = 0; i < recipient.length; i++) {
            vest(recipient[i], vestingAmounts[i], vestingCliff[i], vestingEnd[i], bonus[i]);
        }

    }

    function claim(address recipient) public {
        VestingInfo storage info = userVestingInfo[recipient]; 
        require(info.vester != address(0), "TreasuryVesterFactory::claim: not vesting");
        TreasuryVester(info.vester).claim();
    }

    function claimAll() external {
        require(recipients.length > 0, 'TreasuryVesterFactory::claimAll: called before any deploys');
        for (uint i = 0; i < recipients.length; i++) {
            claim(recipients[i]);
        }
    }

    function notifyFunds(address recipient) public {
        VestingInfo storage info = userVestingInfo[recipient];
        require(info.vester != address(0), 'TreasuryVesterFactory::notifyFunds: not deployed');

        if (info.amount > 0) {
            uint amount = info.amount;
            info.amount = 0;
            require(
                IRoute(route).transfer(info.vester, amount),
                'TreasuryVesterFactory::notifyFunds: transfer failed'
            );
        }
    }

    function notifyFundsForAll() external {
        require(recipients.length > 0, 'TreasuryVesterFactory::notifyFundsForAll: called before any deploys');
        for (uint i = 0; i < recipients.length; i++) {
            notifyFunds(recipients[i]);
        }
    }

    function rescueFunds(address recipient) external onlyOwner {
        VestingInfo storage info = userVestingInfo[recipient];
        require(info.vester != address(0), 'TreasuryVesterFactory::notifyFunds: not deployed');
        TreasuryVester(info.vester).rescue();
    }

    function rescueFactoryFunds() external onlyOwner {
        IRoute(route).transfer(msg.sender, IRoute(route).balanceOf(address(this)));
    }
}